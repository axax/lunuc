import dns2 from 'dns2'
import dns from 'dns'
import dgram from 'dgram'
import Hook from '../../util/hook.cjs'
import schemaGen from './gensrc/schema'
import resolverGen from './gensrc/resolver'
import {deepMergeToFirst} from 'util/deepMerge.mjs'
import Util from '../../api/util/index.mjs'
import {parseOrElse} from '../../client/util/json.mjs'
import {getGatewayIp} from '../../util/gatewayIp.mjs'
import {encodeName, buildRawQuery, scanTtls, materializeRaw, truncateRaw} from './dnsWire.mjs'

// Registered for log output / type names only. dns2 has no Resource codec for
// these - they are never handed to its parser, see needsParsedAnswer().
dns2.Packet.TYPE['SVCB'] = 64
dns2.Packet.TYPE['HTTPS'] = 65

const dnsServerContext = {
    server: false,
    tcpServer: false,
    database: false,
    hosts: {},
    hostsGroup: {},
    dbBuffer: new Map(), // Map, not object: .size is O(1) in the request path
    settings: {},
    typeMap: Object.keys(dns2.Packet.TYPE).reduce((a, k) => {
        a[dns2.Packet.TYPE[k]] = k;
        return a
    }, {})
}


// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolverGen(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schemaGen)
})


// Hook when db is ready
Hook.on('appready', async ({db, context}) => {

    dnsServerContext.settings = (await Util.getKeyValueGlobal(db, context, 'DnsSettings', true)) || {}

    if (!dnsServerContext.settings.execfilter || Util.execFilter(dnsServerContext.settings.execfilter)) {

        if (dnsServerContext?.settings?.internalDnsServers?.length > 0) {
            dns.setServers(dnsServerContext.settings.internalDnsServers)
        }

        // refresh settings every minute
        setInterval(async () => {
            dnsServerContext.settings = (await Util.getKeyValueGlobal(db, context, 'DnsSettings', true)) || {}

            Object.keys(dnsServerContext.hostsGroup).forEach(key => {
                const hostGroup = dnsServerContext.hostsGroup[key]

                if (!hostGroup.block && hostGroup.blockRule) {
                    try {
                        const tpl = new Function(hostGroup.blockRule)
                        hostGroup._block = tpl.call({})
                    } catch (e) {
                        // A broken rule must not kill the refresh interval. NOTE: an
                        // infinite loop in a rule still blocks the event loop — use
                        // vm.runInNewContext(code, {}, {timeout}) for real isolation.
                        console.warn(`DNS: blockRule failed for group ${key}: ${e.message}`)
                        hostGroup._block = false
                    }
                } else {
                    hostGroup._block = false
                }

            })

            // periodically flush the access-count buffer (in case traffic is too low
            // to ever hit the size threshold in the request handler)
            insertBuffer()

        }, 1000 * 60)

        dnsServerContext.database = db
        await readHosts(db)


        console.log('DNS: create dns server')

        dnsServerContext.server = dns2.createServer({
            udp: true,
            handle: createHandler('udp')
        })

        // Separate instance for TCP so the handler knows its transport: only UDP
        // replies need truncation, and a client that saw our TC bit has nowhere
        // else to go if nobody listens on tcp/53.
        dnsServerContext.tcpServer = dns2.createServer({
            tcp: true,
            handle: createHandler('tcp')
        })

        dnsServerContext.server.on('requestError', (error) => {
            console.log('DNS: Client sent an invalid request', error)
        })

        dnsServerContext.tcpServer.on('requestError', (error) => {
            console.log('DNS/tcp: Client sent an invalid request', error)
        })

        dnsServerContext.server.on('listening', async () => {
            console.log('DNS: listening', dnsServerContext.server.addresses())
            await refreshGatewayIp()
            Hook.call('dnsready', {db, context})
        })

        dnsServerContext.tcpServer.on('listening', () => {
            console.log('DNS/tcp: listening')
        })

        dnsServerContext.server.on('close', () => {
            console.log('DNS: server closed')
        })

        dnsServerContext.tcpServer.on('close', () => {
            console.log('DNS/tcp: server closed')
        })

        dnsServerContext.server.on('error', (e) => {
            console.log('DNS: server error', e)
        })

        dnsServerContext.tcpServer.on('error', (e) => {
            console.log('DNS/tcp: server error', e)
        })

        dnsServerContext.server.listen({
            udp: {
                port: 53,
                address: '0.0.0.0',
                type: 'udp4',  // IPv4 or IPv6 (Must be either "udp4" or "udp6")
            }
        })

        // NOTE: an idle TCP connection still costs a socket. Per-source
        // connection limits belong in the firewall (nftables `ct count`) - the
        // handler-level rate limit below only ever sees complete queries.
        if (dnsServerContext.settings.tcp !== false) {
            dnsServerContext.tcpServer.listen({
                tcp: {
                    port: 53,
                    address: '0.0.0.0'
                }
            })
        }

        // eventually
        // server.close();
    } else {
        Hook.call('dnsready', {db, context})
    }
})

// Hook when the type CronJob has changed
Hook.on('typeUpdated_DnsHost', ({result}) => {
    const key = result.name && result.name.toLowerCase()
    if (key && dnsServerContext.hosts[key]) {
        if (result.group !== undefined) {
            dnsServerContext.hosts[key].group = result.group
        }
        dnsServerContext.hosts[key].response = parseOrElse(result.response)

        if (result.block !== undefined) {
            dnsServerContext.hosts[key].block = result.block
        }
        if (result.subdomains !== undefined) {
            dnsServerContext.hosts[key].subdomains = result.subdomains
        }
        // Promote out of the ephemeral pool now that it carries real config.
        if (dnsServerContext.hosts[key]._ephemeral) {
            delete dnsServerContext.hosts[key]._ephemeral
            ephemeralHosts.delete(key)
        }
    }
})
Hook.on(['typeUpdated_DnsHostGroup', 'typeCreated_DnsHostGroup'], ({result}) => {
    const id = result._id.toString()
    if (!dnsServerContext.hostsGroup[id]) {
        dnsServerContext.hostsGroup[id] = result
    }
    dnsServerContext.hostsGroup[id].block = result.block
    dnsServerContext.hostsGroup[id].blockRule = result.blockRule ? result.blockRule.trim() : ''
})

Hook.on('appexit', async () => {
    await insertBuffer()
})

// Resolved once at startup - the address is static here. Failures are logged
// rather than swallowed: a missing gateway ip silently disables the hairpin
// rewrite below, which shows up as local services failing to reach themselves.
const refreshGatewayIp = async () => {
    try {
        const current = await getGatewayIp(true)
        if (!current) {
            throttledWarn('gateway-ip', 'DNS: could not determine gateway ip')
            return
        }
        if (current !== dnsServerContext.gatewayIp) {
            console.log(`DNS: gateway ip ${dnsServerContext.gatewayIp || '(none)'} -> ${current}`)
            dnsServerContext.gatewayIp = current
        }
    } catch (e) {
        throttledWarn('gateway-ip', `DNS: gateway ip lookup failed: ${e.message}`)
    }
}

const debugMessage = (msg, details) => {
    if (dnsServerContext.settings.debug) {
        if (details) {
            console.debug(msg, details)
        } else {
            console.debug(msg)
        }
    }
}

// Throttle noisy warnings to at most one per key per second. An upstream outage
// would otherwise trigger one synchronous console.warn per query -> a log-storm
// that blocks the event loop exactly when the system is already under pressure.
// Keyed by a fixed category (not hostname) so the map stays bounded.
const warnThrottle = {}
const throttledWarn = (key, msg) => {
    const now = Date.now()
    const entry = warnThrottle[key] || (warnThrottle[key] = {last: 0, suppressed: 0})
    if (now - entry.last >= 1000) {
        if (entry.suppressed > 0) {
            console.warn(`${msg} (+${entry.suppressed} suppressed)`)
        } else {
            console.warn(msg)
        }
        entry.last = now
        entry.suppressed = 0
    } else {
        entry.suppressed++
    }
}

let dnsResolvers = {}
// O(1) cache keyed by cacheKey. Map preserves insertion order, so the oldest
// entry is always the first key -> cheap FIFO eviction.
const dnsCachedAnswers = new Map()
// In-flight resolves, keyed by cacheKey, to coalesce concurrent identical
// queries and prevent a cache stampede against the upstream resolver.
const pendingResolves = new Map()

// Auto-created (ephemeral) host entries grow without bound under random-subdomain
// floods. Track them in insertion order and evict the oldest beyond a cap, so
// untrusted queries can't push the process into a GC death-spiral / OOM.
const ephemeralHosts = new Set()
const trackEphemeralHost = (name) => {
    ephemeralHosts.add(name)
    const maxEphemeral = dnsServerContext.settings.maxEphemeralHosts || 50000
    while (ephemeralHosts.size > maxEphemeral) {
        const oldest = ephemeralHosts.values().next().value
        ephemeralHosts.delete(oldest)
        // Only drop if still ephemeral (may have been configured meanwhile).
        if (dnsServerContext.hosts[oldest] && dnsServerContext.hosts[oldest]._ephemeral) {
            delete dnsServerContext.hosts[oldest]
            dnsServerContext.dbBuffer.delete(oldest)
        }
    }
}

const ERROR_ANSWER = () => ({header: {}, authorities: [], additionals: [], answers: [], isError: true})
const RAW_ERROR_ANSWER = () => ({raw: null, isError: true})
const errorAnswerFor = (raw) => raw ? RAW_ERROR_ANSWER() : ERROR_ANSWER()

// Copy the upstream result flags onto the header that createResponseFromRequest
// built. Never replace response.header itself: it carries qr/opcode/counts that
// dns2 needs when packing the reply.
const applyUpstreamHeader = (response, upstreamHeader) => {
    if (!upstreamHeader) {
        return
    }
    for (const key of ['aa', 'tc', 'rd', 'ra', 'z', 'rcode']) {
        if (upstreamHeader[key] !== undefined) {
            response.header[key] = upstreamHeader[key]
        }
    }
}

// --- Request handler ---------------------------------------------------------

// dns2 hands us a dgram rinfo on UDP ({address, port}) but the net.Socket
// itself on TCP, where `address` is a *function* and the peer IP lives in
// remoteAddress. Normalise once so nothing downstream has to care - and strip
// the IPv4-mapped IPv6 prefix, or ::ffff:127.0.0.1 would fail every comparison
// against a plain dotted-quad.
const clientAddress = (rinfo) => {
    if (!rinfo) {
        return ''
    }
    let address = ''
    if (typeof rinfo.address === 'string') {
        address = rinfo.address
    } else if (typeof rinfo.remoteAddress === 'string') {
        address = rinfo.remoteAddress
    }
    if (!address) {
        // Without a peer IP the allowlist and the rate limiter are blind.
        throttledWarn('no-client-address', 'DNS: could not determine client address')
        return ''
    }
    return address.startsWith('::ffff:') ? address.substring(7) : address
}

// The gateway rewrite is the only place where we look inside an answer, and it
// only ever applies to A/AAAA queries from localhost. Everything else is
// forwarded as raw bytes: that keeps SVCB/HTTPS working (dns2 cannot code them)
// and gets us EDNS0 on the upstream query for free.
const needsParsedAnswer = (question, address) =>
    (question.type === dns2.Packet.TYPE.A || question.type === dns2.Packet.TYPE.AAAA) &&
    address === '127.0.0.1'

// Advertised UDP payload size of the *client*. Without an OPT record we must
// stay within the classic 512 byte limit, or the reply gets fragmented and
// quietly dropped by routers and firewalls on the way back.
const clientUdpSize = (request) => {
    const opt = (request.additionals || []).find(a => a.type === 41)
    if (!opt) {
        return 512
    }
    // Field name differs between dns2 versions - verify against yours.
    const size = opt.udpPayloadSize || opt.udpSize || opt.class || 512
    return Math.min(Math.max(size, 512), 4096)
}

const createHandler = (transport) => async (request, send, rinfo) => {
    let response

    try {
        const address = clientAddress(rinfo)

        // Build the response first: if anything below throws, the catch still
        // has a packet to answer with instead of leaving the client hanging.
        response = dns2.Packet.createResponseFromRequest(request)
        const [question] = request.questions

        if (dnsServerContext?.settings?.blockedIps) {
            for (const blockedIp of dnsServerContext.settings.blockedIps) {
                if (address.startsWith(blockedIp)) {
                    debugMessage(`DNS: drop from blocked ip ${address}`)
                    return
                }
            }
        }

        if (!isTrustedSource(address)) {
            // Per-source flood protection. Silent drop => no reply at all,
            // so we don't reflect anything toward a possibly-spoofed victim.
            if (isRateLimited(address)) {
                // Throttled, so a flood costs one line per second, not one per
                // packet - but you can still see that the limiter is firing.
                throttledWarn('rate-limited', `DNS: rate limit hit, dropping queries from ${address}`)
                return
            }
            if (question && question.name) {
                // High-amplification query types (TXT/ANY): drop silently.
                // This is the actual attack signature in the logs
                // (cisco.com TXT x1000) — killing it removes both the
                // amplification and the reflection.
                const refuseTypes = dnsServerContext.settings.refuseTypesForUntrusted ||
                    [dns2.Packet.TYPE.ANY, dns2.Packet.TYPE.TXT]
                if (refuseTypes.includes(question.type)) {
                    throttledWarn('refused-type',
                        `DNS: dropping high-amplification query (Type: ${question.type}) from ${address}`)
                    return
                }
                // We are not an open recursive resolver. For everything else
                // from an untrusted source, answer REFUSED (rcode 5): a tiny
                // reply with no answer section, i.e. no amplification incentive.
                // Set refuseRecursionForUntrusted=false to keep serving them.
                if (dnsServerContext.settings.refuseRecursionForUntrusted !== false) {
                    response.header.rcode = 5 // REFUSED
                    sendPacket(send, response, request, transport)
                    return
                }
            }
        }

        if (!question || !question.name) {
            sendPacket(send, response, request, transport)
            return
        }

        // DNS names are case-insensitive, our maps are not. Normalise once here
        // and use `name` for every lookup, the cache key and the db buffer -
        // otherwise WWW.Doubleclick.NET slips past a block on the lower-case
        // entry, and 0x20-randomising resolvers create one ephemeral host and
        // one cache entry per spelling.
        const name = question.name.toLowerCase()
        const startTime = new Date().getTime()

        if (dnsServerContext.hosts[name] === undefined) {
            dnsServerContext.hosts[name] = {block: false, subdomains: false, _ephemeral: true}
            trackEphemeralHost(name)
        }

        if (!dnsServerContext.hosts[name].count) {
            dnsServerContext.hosts[name].count = 0
        }
        dnsServerContext.hosts[name].count++

        const blockActive = isHostBlocked(name) && !dnsServerContext.settings.disabled
        const localResponse = dnsServerContext.hosts[name].response
        const typeName = dnsServerContext.typeMap[question.type] || question.type

        if (blockActive) {
            debugMessage(`DNS: block ${name}`)

            if (question.type === dns2.Packet.TYPE.A || question.type === dns2.Packet.TYPE.AAAA) {
                // Block answer must match the requested record type:
                // A -> 0.0.0.0, AAAA -> ::
                const nullAddress =
                    question.type === dns2.Packet.TYPE.AAAA ? '::' : '0.0.0.0'

                response.answers.push({
                    name: question.name,
                    type: question.type,
                    class: question.class,
                    ttl: 300,
                    address: nullAddress
                })
            } else {
                // Every other type (MX, TXT, SVCB/HTTPS...) has no address field -
                // a fabricated address record would throw while packing. NODATA
                // makes clients fall back to A/AAAA, where the block bites.
                response.answers = []
            }
            sendPacket(send, response, request, transport)

        } else if (localResponse?.answers?.length > 0) {
            applyUpstreamHeader(response, localResponse.header)
            response.authorities = localResponse.authorities || []
            response.answers = localResponse.answers
            response.additionals = localResponse.additionals || []
            sendPacket(send, response, request, transport)

        } else if (needsParsedAnswer(question, address)) {
            const resolved = await resolveDnsQuestion(question, name, false)

            if (resolved.isError) {
                // Never replace response.header with an empty object: that strips
                // qr/opcode and the reply goes out looking like a query, which
                // clients silently discard and retry.
                response.header.rcode = 2 // SERVFAIL
                response.answers = []
            } else {
                applyUpstreamHeader(response, resolved.header)
                const age = answerAge(resolved)
                response.authorities = ageRecords(resolved.authorities, age)
                response.additionals = ageRecords(resolved.additionals, age)
                // Hairpin NAT: services on this host cannot reach themselves
                // via the public gateway address, so point localhost at the
                // loopback instead. Excluded names (the local mail server) must
                // keep the real route - configurable via settings, because a new
                // mail domain should not require a deploy.
                const gatewayIp = dnsServerContext.gatewayIp
                const rewriteExclude = dnsServerContext.settings.gatewayRewriteExclude ||
                    ['mail.onyou.ch', 'mail-service.onyou.ch']

                response.answers = ageRecords(resolved.answers, age).map(answer => {
                    if (gatewayIp && !rewriteExclude.includes(name) && answer.address === gatewayIp) {
                        return Object.assign({}, answer, {address: '127.0.0.1'})
                    }
                    return answer
                })
            }
            sendPacket(send, response, request, transport)
            debugMessage(`DNS: resolved ${name} (Type: ${typeName}) after ${new Date().getTime() - startTime}ms`)

        } else {
            const resolved = await resolveDnsQuestion(question, name, true)

            if (resolved.raw) {
                sendRaw(send, resolved, request, question, transport)
            } else {
                response.header.rcode = 2 // SERVFAIL
                response.answers = []
                sendPacket(send, response, request, transport)
            }
            debugMessage(`DNS: resolved ${name} (Type: ${typeName}, raw) after ${new Date().getTime() - startTime}ms`)
        }

        dnsServerContext.dbBuffer.set(name, {
            updateOne: {
                filter: {name},
                update: {
                    $set: {
                        lastIp: address,
                        lastUsed: new Date().getTime(),
                        name,
                        count: dnsServerContext.hosts[name].count
                    }
                },
                upsert: true
            }
        })

        // Fire-and-forget: never block the request handler on a DB round-trip.
        // insertBuffer() guards against overlapping writes internally - while a
        // write is in flight every call returns immediately and the buffer keeps
        // growing, which is exactly why reading its size must stay O(1).
        if (dnsServerContext.dbBuffer.size > 20) {
            insertBuffer()
        }
    } catch (e) {
        // The handler is async: an uncaught throw becomes an unhandled rejection
        // and the client gets nothing at all - it just waits out its own timeout.
        // A SERVFAIL at least fails fast and visibly.
        const failedName = request?.questions?.[0]?.name || '?'
        const failedType = request?.questions?.[0]?.type || '?'
        throttledWarn('handler-error',
            `DNS: handler failed on ${transport} for ${failedName} (Type: ${failedType}): ${e.stack || e.message}`)
        try {
            if (response) {
                response.header.rcode = 2 // SERVFAIL
                response.answers = []
                response.authorities = []
                response.additionals = []
                send(response)
            }
        } catch (sendError) {
            // nothing left to do for this query
        }
    }
}

// --- Sending -----------------------------------------------------------------

// Truncate rather than emit an oversized UDP datagram: the client sees TC and
// retries over TCP, which we now listen on.
const sendPacket = (send, response, request, transport) => {
    try {
        if (transport === 'udp') {
            let buffer
            try {
                buffer = response.toBuffer()
            } catch (e) {
                // Without a serialised packet we cannot check the size, so the
                // reply may go out oversized. Worth knowing about.
                throttledWarn('tobuffer-failed', `DNS: could not size response: ${e.message}`)
                buffer = null
            }
            if (buffer && buffer.length > clientUdpSize(request)) {
                response.header.tc = 1
                response.answers = []
                response.authorities = []
                response.additionals = []
            }
        }
        send(response)
    } catch (e) {
        console.log('DNS: send failed', e.message)
    }
}

const sendRaw = (send, answer, request, question, transport) => {
    let out
    try {
        out = materializeRaw(answer, request.header.id, question.name)
        if (transport === 'udp' && out.length > clientUdpSize(request)) {
            out = truncateRaw(out, question.name)
        }
    } catch (e) {
        console.log('DNS: raw materialize failed', e.message)
        return
    }

    // dns2 serialises Packet instances and forwards everything else to the
    // socket unchanged, so a plain Buffer goes out as-is. A duck-typed
    // {toBuffer} object does NOT work: it lands in socket.send() verbatim.
    try {
        send(out)
        return
    } catch (e) {
        // Some versions call toBuffer() on whatever they are handed instead.
        // Use a real Packet so instanceof checks still pass, and override the
        // serialisation to emit our bytes.
        try {
            const packet = dns2.Packet.createResponseFromRequest(request)
            packet.toBuffer = () => out
            send(packet)
            return
        } catch (fallbackError) {
            console.log('DNS: raw send failed', e.message, '/', fallbackError.message)
        }
    }
}

// --- Raw wire helpers -------------------------------------------------------
// encodeName / buildRawQuery / scanTtls / materializeRaw / truncateRaw live in
// ./dnsWire.mjs - pure Buffer functions, covered by dnsWire.test.mjs.

// One ephemeral socket per query: the random source port makes off-path
// spoofing harder and there is no transaction-id collision to handle. The
// number of open sockets is bounded by maxConcurrentUpstream.
const rawQuery = (buffer, id, server, timeoutMs) => new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4')
    let timer
    let settled = false

    const done = (err, data) => {
        if (settled) {
            return
        }
        settled = true
        clearTimeout(timer)
        try {
            socket.close()
        } catch (e) {
            // already closing
        }
        err ? reject(err) : resolve(data)
    }

    timer = setTimeout(
        () => done(Object.assign(new Error('raw dns timeout'), {code: 'ETIMEDOUT'})),
        timeoutMs
    )

    socket.on('message', (msg, from) => {
        // Only accept a reply from the server we asked, carrying our own id.
        if (from.address !== server || msg.length < 12 || msg.readUInt16BE(0) !== id) {
            return
        }
        done(null, msg)
    })
    socket.on('error', (e) => done(e))
    socket.send(buffer, 53, server, (e) => {
        if (e) {
            done(e)
        }
    })
})

// --- Upstream server selection ----------------------------------------------
// A single upstream is a single point of failure: if it goes down, every query
// SERVFAILs. Rotate the starting point so load is spread, and fall through to
// the next server on timeout or error.
let upstreamCursor = 0
const getUpstreamServers = () => {
    const configured = dnsServerContext.settings.dns
    if (Array.isArray(configured) && configured.length > 0) {
        return configured
    }
    if (typeof configured === 'string' && configured.length > 0) {
        return configured.split(',').map(s => s.trim()).filter(Boolean)
    }
    return ['8.8.8.8', '1.1.1.1']
}

const orderedUpstreams = () => {
    const servers = getUpstreamServers()
    const maxAttempts = Math.min(servers.length, dnsServerContext.settings.maxUpstreamAttempts || 2)
    const start = upstreamCursor++ % servers.length
    const ordered = []
    for (let i = 0; i < maxAttempts; i++) {
        ordered.push(servers[(start + i) % servers.length])
    }
    return ordered
}

// --- Source-based access control & rate limiting ----------------------------
// NOTE: these run *inside* the handler, i.e. after the packet was already parsed
// on the event loop. They remove amplification/reflection (no upstream work, no
// large reply to a spoofed victim) but do NOT stop a raw packet flood from
// reaching the process. A firewall on :53 is still the real protection.

// A source is "trusted" (may use us recursively) if its IP matches an allowlist
// prefix. Empty/absent allowlist => everyone trusted, so this is OPT-IN and does
// not change behaviour until settings.allowedIps is configured.
const isTrustedSource = (address) => {
    const allow = dnsServerContext.settings.allowedIps
    if (!allow || allow.length === 0) {
        return true
    }
    for (const prefix of allow) {
        if (address.startsWith(prefix)) {
            return true
        }
    }
    return false
}

// Fixed-window per-source rate limiter. O(1), bounded (map reset each window).
// Spoofed source IPs defeat per-source limits, but real scanners get throttled.
let rateWindowStart = Date.now()
let rateCounts = new Map()
const isRateLimited = (address) => {
    const limit = dnsServerContext.settings.perSourceQps || 0
    if (limit <= 0) {
        return false
    }
    const now = Date.now()
    if (now - rateWindowStart >= 1000) {
        rateWindowStart = now
        rateCounts = new Map()
    }
    const c = (rateCounts.get(address) || 0) + 1
    rateCounts.set(address, c)
    return c > limit
}

// --- Upstream concurrency limiter -------------------------------------------
// Caps how many upstream lookups run at the same time. A burst of many *distinct*
// names/types defeats both cache and coalescing (each has a unique cacheKey), so
// without this every query opens its own lookup -> unbounded UDP sockets /
// file descriptors -> EMFILE -> the whole process (incl. the API) stalls.
// Excess lookups wait in a bounded queue; if that is full, we shed load and reply
// with an (uncached) error answer so the client can retry.
let activeUpstream = 0
const upstreamQueue = []
const maxConcurrentUpstream = () => dnsServerContext.settings.maxConcurrentResolves || 50
const maxUpstreamQueue = () => dnsServerContext.settings.maxResolveQueue || 1000

const pumpUpstreamQueue = () => {
    while (activeUpstream < maxConcurrentUpstream() && upstreamQueue.length > 0) {
        const job = upstreamQueue.shift()
        job()
    }
}

const scheduleUpstream = (question, name, cacheKey, raw) => {
    return new Promise((resolve) => {
        const job = () => {
            activeUpstream++
            doResolveUpstream(question, name, cacheKey, raw)
                .then(resolve, (err) => {
                    // doResolveUpstream catches its own errors, so landing here
                    // means something unexpected broke - never swallow it.
                    throttledWarn('resolve-rejected',
                        `DNS: resolve rejected for ${name}: ${err && err.message}`)
                    resolve(errorAnswerFor(raw))
                })
                .finally(() => {
                    activeUpstream--
                    pumpUpstreamQueue()
                })
        }

        if (activeUpstream < maxConcurrentUpstream()) {
            job()
        } else if (upstreamQueue.length < maxUpstreamQueue()) {
            upstreamQueue.push(job)
        } else {
            // Throttled: this fires exactly when the system is already
            // overloaded, so one un-throttled line per query would make it worse.
            throttledWarn('queue-full', `DNS: resolve queue full (${upstreamQueue.length}), shedding queries`)
            resolve(errorAnswerFor(raw))
        }
    })
}
// ----------------------------------------------------------------------------

const resolveDnsQuestion = async (question, name, raw) => {
    // Mode is part of the key: a raw buffer and a parsed answer for the same
    // name must not overwrite each other.
    const cacheKey = `${raw ? 'r' : 'p'}|${name}|${question.type}|${question.class}`

    const cached = dnsCachedAnswers.get(cacheKey)
    if (cached) {
        if (cached.expiresAt > Date.now()) {
            return cached.answer
        }
        dnsCachedAnswers.delete(cacheKey)
    }

    // If an identical query is already being resolved, await the same promise
    // instead of firing another upstream lookup.
    const inFlight = pendingResolves.get(cacheKey)
    if (inFlight) {
        return inFlight
    }

    const resolvePromise = scheduleUpstream(question, name, cacheKey, raw)
    pendingResolves.set(cacheKey, resolvePromise)
    try {
        return await resolvePromise
    } finally {
        pendingResolves.delete(cacheKey)
    }
}

// --- TTL handling ------------------------------------------------------------
// Cache lifetime follows the smallest TTL in the answer instead of a flat 30s,
// clamped so a TTL of 5 doesn't defeat the cache and a TTL of a week doesn't pin
// a stale record. What we hand out is aged by the time spent in the cache, so a
// client never holds a record longer than its origin allows.

const answerAge = (answer) => answer.storedAt ? Math.floor((Date.now() - answer.storedAt) / 1000) : 0

const ageRecords = (records, age) => {
    if (!records || records.length === 0) {
        return []
    }
    if (age <= 0) {
        return records
    }
    return records.map(record => typeof record.ttl === 'number'
        ? Object.assign({}, record, {ttl: Math.max(1, record.ttl - age)})
        : record)
}

const answerMinTtl = (answer) => {
    let min = Infinity
    for (const records of [answer.answers, answer.authorities]) {
        if (!records) {
            continue
        }
        for (const record of records) {
            if (record.type === 41) {
                continue
            }
            if (typeof record.ttl === 'number' && record.ttl < min) {
                min = record.ttl
            }
        }
    }
    return min === Infinity ? 0 : min
}

const cacheDurationFor = (answer) => {
    if (answer.isError) {
        return (dnsServerContext.settings.errorCacheTtl || 5) * 1000
    }
    const minTtl = answer.minTtl || 0
    if (minTtl <= 0) {
        // Empty answer, NODATA, or no TTL we could read.
        return (dnsServerContext.settings.emptyCacheTtl || 30) * 1000
    }
    const floor = dnsServerContext.settings.minCacheTtl || 5
    const ceiling = dnsServerContext.settings.maxCacheTtl || 3600
    return Math.min(Math.max(minTtl, floor), ceiling) * 1000
}

const cacheAnswer = (cacheKey, answer) => {
    // Lazy TTL: store an expiry timestamp instead of one setTimeout per entry.
    // Removes timer accumulation and the bug where a stale TTL timer deletes a
    // newer entry that reused the same key after FIFO eviction.
    answer.storedAt = Date.now()
    dnsCachedAnswers.set(cacheKey, {answer, expiresAt: answer.storedAt + cacheDurationFor(answer)})

    const maxNumbersOfCachedAnswers = dnsServerContext.settings.cacheSize || 1000
    if (dnsCachedAnswers.size > maxNumbersOfCachedAnswers) {
        const oldestKey = dnsCachedAnswers.keys().next().value
        dnsCachedAnswers.delete(oldestKey)
    }
}

// --- Upstream resolution -----------------------------------------------------

const doResolveUpstream = async (question, name, cacheKey, raw) => {
    const answer = raw
        ? await doResolveUpstreamRaw(question, name)
        : await doResolveUpstreamParsed(question, name)

    cacheAnswer(cacheKey, answer)
    return answer
}

const doResolveUpstreamRaw = async (question, name) => {
    const timeoutMs = dnsServerContext.settings.resolveTimeout || 5000
    const questionNameLength = encodeName(name).length
    let lastError

    for (const server of orderedUpstreams()) {
        const id = Math.floor(Math.random() * 65536)
        try {
            const buffer = await rawQuery(buildRawQuery(name, question.type, question.class, id), id, server, timeoutMs)

            // TC from upstream: even 1232 bytes were not enough. Pass it on -
            // the client can retry against our TCP listener.
            if ((buffer.readUInt8(2) & 0x02) !== 0) {
                throttledWarn('raw-truncated', `DNS: upstream truncated answer for ${name} (Type: ${question.type})`)
            }

            let ttlInfo = {ttlOffsets: [], minTtl: 0}
            try {
                ttlInfo = scanTtls(buffer)
            } catch (e) {
                // Unreadable structure: still forward the bytes, just without TTL
                // ageing and with the short default cache lifetime.
                throttledWarn('raw-scan', `DNS: could not scan TTLs for ${name}: ${e.message}`)
            }

            return {
                raw: buffer,
                isError: false,
                questionNameLength,
                ttlOffsets: ttlInfo.ttlOffsets,
                minTtl: ttlInfo.minTtl
            }
        } catch (err) {
            lastError = err
            const key = err.code === 'ETIMEDOUT' ? 'raw-timeout' : 'raw-error'
            throttledWarn(key, `DNS: raw resolve via ${server} failed: ${err.message}`)
        }
    }

    throttledWarn('raw-exhausted', `DNS: all upstreams failed for ${name}: ${lastError && lastError.message}`)
    return RAW_ERROR_ANSWER()
}

const doResolveUpstreamParsed = async (question, name) => {
    const typeName = dnsServerContext.typeMap[question.type]
    const timeoutMs = dnsServerContext.settings.resolveTimeout || 5000

    for (const server of orderedUpstreams()) {
        if (!dnsResolvers[server]) {
            dnsResolvers[server] = new dns2({
                dns: server,
                recursive: false
            })
        }

        let timeoutHandle
        try {
            const answer = await Promise.race([
                dnsResolvers[server].resolve(name, typeName, question.class),
                new Promise((_, reject) => {
                    timeoutHandle = setTimeout(
                        () => reject(Object.assign(
                            new Error(`DNS timeout after ${timeoutMs}ms for ${name}`),
                            {code: 'ETIMEDOUT'}
                        )),
                        timeoutMs
                    )
                })
            ])
            answer.isError = false
            answer.minTtl = answerMinTtl(answer)
            return answer
        } catch (err) {
            if (err.code === 'ETIMEDOUT') {
                throttledWarn('upstream-timeout', `DNS: timeout resolving via ${server}`)
            } else {
                throttledWarn('upstream-error', `DNS: error resolving via ${server}: ${err.message}`)
            }
        } finally {
            // Always clear the race timer, otherwise tens of thousands of pending
            // timers pile up under load.
            if (timeoutHandle) {
                clearTimeout(timeoutHandle)
            }
        }
    }

    throttledWarn('upstream-exhausted', `DNS: all upstreams failed for ${name} (Type: ${question.type})`)
    return ERROR_ANSWER()
}

const readHosts = async (db) => {
    await db.collection('DnsHost').find().forEach(o => {
        const entry = {
            block: o.block,
            subdomains: o.subdomains,
            count: o.count,
            // Stored as a JSON string - parse it here just like the
            // typeUpdated_DnsHost hook does. Without this, local overrides stay
            // inactive after a restart until the record is saved again.
            response: parseOrElse(o.response),
            group: o.group
        }
        // Hosts stored purely for usage stats (no block/subdomain/group/response)
        // are ephemeral and subject to the in-memory cap.
        const isConfigured = o.block === true || o.subdomains === true ||
            (o.group && o.group.length > 0) || !!o.response
        if (!isConfigured) {
            entry._ephemeral = true
        }
        const key = o.name.toLowerCase()
        dnsServerContext.hosts[key] = entry
        if (!isConfigured) {
            trackEphemeralHost(key)
        }
    })

    await db.collection('DnsHostGroup').find().forEach(o => {
        dnsServerContext.hostsGroup[o._id.toString()] = {
            block: o.block,
            blockRule: o.blockRule ? o.blockRule.trim() : ''
        }
    })
}


const isHostGroupBlocked = (hostname) => {
    let block = false
    const groups = dnsServerContext.hosts[hostname].group || []
    for (const group of groups) {
        const hostGroup = dnsServerContext.hostsGroup[group.toString()]
        if (hostGroup && (hostGroup.block || hostGroup._block)) {
            block = true
            break
        }
    }
    return block
}

// Expects an already lower-cased hostname.
const isHostBlocked = (hostname) => {
    let block = dnsServerContext.hosts[hostname].block === true

    if (!block) {
        // check group blocking
        block = isHostGroupBlocked(hostname)
    }

    if (!block) {
        //check subdomains
        let subHostname = hostname
        let pos = subHostname.indexOf('.')
        while (pos >= 0) {
            subHostname = subHostname.substring(pos + 1)
            if (dnsServerContext.hosts[subHostname] && dnsServerContext.hosts[subHostname].subdomains === true) {

                if (dnsServerContext.hosts[subHostname].block === true) {
                    block = true
                    break
                } else {
                    block = isHostGroupBlocked(subHostname)
                    if (block) {
                        break
                    }
                }
            }
            pos = subHostname.indexOf('.')
        }
    }
    return block
}

// Guard against overlapping writes: under high load many request handlers would
// otherwise fire bulkWrite at the same time and exhaust the Mongo connection pool.
let insertingBuffer = false
const insertBuffer = async () => {
    if (!dnsServerContext.database || insertingBuffer) {
        return
    }
    if (dnsServerContext.dbBuffer.size === 0) {
        return
    }
    // Snapshot & clear before the async write so concurrent requests accumulate
    // into a fresh buffer instead of being lost or written twice.
    const values = Array.from(dnsServerContext.dbBuffer.values())
    dnsServerContext.dbBuffer = new Map()
    insertingBuffer = true
    try {
        await dnsServerContext.database.collection('DnsHost').bulkWrite(values, {ordered: false})
    } catch (e) {
        console.warn('DNS: insertBuffer failed', e.message)
    } finally {
        insertingBuffer = false
    }
}
