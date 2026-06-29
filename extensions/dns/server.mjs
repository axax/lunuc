import dns2 from 'dns2'
import dns from 'dns'
import Hook from '../../util/hook.cjs'
import schemaGen from './gensrc/schema'
import resolverGen from './gensrc/resolver'
import {deepMergeToFirst} from 'util/deepMerge.mjs'
import Util from '../../api/util/index.mjs'
import {parseOrElse} from '../../client/util/json.mjs'
import {getGatewayIp} from '../../util/gatewayIp.mjs'

dns2.Packet.TYPE['HTTPS'] = 65
const dnsServerContext = {
    server: false,
    database: false,
    hosts: {},
    hostsGroup: {},
    dbBuffer: {},
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

        if(dnsServerContext?.settings?.internalDnsServers?.length>0) {
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
            handle: async (request, send, rinfo) => {

                if(dnsServerContext?.settings?.blockedIps){
                    for(const blockedIp of dnsServerContext.settings.blockedIps){
                        if(rinfo.address.startsWith(blockedIp)){
                            return
                        }
                    }
                }



                const response = dns2.Packet.createResponseFromRequest(request)
                const [question] = request.questions

                if (!isTrustedSource(rinfo.address)) {
                    // Per-source flood protection. Silent drop => no reply at all,
                    // so we don't reflect anything toward a possibly-spoofed victim.
                    if (isRateLimited(rinfo.address)) {
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
                            return
                        }
                        // We are not an open recursive resolver. For everything else
                        // from an untrusted source, answer REFUSED (rcode 5): a tiny
                        // reply with no answer section, i.e. no amplification incentive.
                        // Set refuseRecursionForUntrusted=false to keep serving them.
                        if (dnsServerContext.settings.refuseRecursionForUntrusted !== false) {
                            response.header.rcode = 5 // REFUSED
                            try {
                                send(response)
                            } catch (e) {
                                // ignore send errors toward abusive/spoofed sources
                            }
                            return
                        }
                    }
                }

                if (question && question.name) {
                    const {name} = question
                    const startTime = new Date().getTime()

                    if (dnsServerContext.hosts[name] === undefined) {
                        dnsServerContext.hosts[name] = {block: false, subdomains: false, _ephemeral: true}
                        trackEphemeralHost(name)
                    }

                    if (!dnsServerContext.hosts[name].count) {
                        dnsServerContext.hosts[name].count = 0
                    }
                    dnsServerContext.hosts[name].count++

                    const hostBlocked = isHostBlocked(name)

                    if (hostBlocked && !dnsServerContext.settings.disabled) {
                        debugMessage(`DNS: block ${name}`)

                        response.answers.push({
                            name,
                            type: question.type,
                            class: question.class,
                            ttl: 300,
                            address: '0.0.0.0'
                        })
                        send(response)

                    } else {
                        const localResponse = dnsServerContext.hosts[name].response
                        if (localResponse?.answers?.length > 0) {
                            response.header = Object.assign({}, localResponse.header, {id: response.header.id})
                            response.authorities = localResponse.authorities || []
                            response.answers = localResponse.answers
                            response.additionals = localResponse.additionals || []
                        } else {
                            const resolvedQuestion = await resolveDnsQuestion(question)
                            response.header = Object.assign({}, resolvedQuestion.header, {id: response.header.id})
                            response.authorities = resolvedQuestion.authorities
                            response.additionals = resolvedQuestion.additionals

                            if (resolvedQuestion?.answers?.length > 0) {
                                // clone answers
                                response.answers = []
                                for(let i = 0;i<resolvedQuestion.answers.length;i++){
                                    const answer = resolvedQuestion.answers[i]
                                    if (question.name!=='mail.onyou.ch' && question.name!== 'mail-service.onyou.ch' &&
                                        answer.address == dnsServerContext.gatewayIp && rinfo.address=="127.0.0.1") {
                                        response.answers.push(Object.assign({},answer,{address:'127.0.0.1'}))
                                    }else{
                                        response.answers.push(answer)
                                    }
                                }
                            }
                        }
                        try {
                            send(response)
                        } catch (e) {
                            console.log(e, response)
                        }
                        const typeName = dnsServerContext.typeMap[question.type] || question.type;
                        debugMessage(`DNS: resolved ${name} (Type: ${typeName}) after ${new Date().getTime() - startTime}ms`)
                    }

                    dnsServerContext.dbBuffer[name] = {
                        updateOne: {
                            filter: {name},
                            update: {
                                $set: {
                                    lastIp: rinfo.address,
                                    lastUsed: new Date().getTime(),
                                    name,
                                    count: dnsServerContext.hosts[name].count
                                }
                            },
                            upsert: true
                        }
                    }

                    // Fire-and-forget: never block the request handler on a DB round-trip.
                    // insertBuffer() guards against overlapping writes internally.
                    if (Object.keys(dnsServerContext.dbBuffer).length > 20) {
                        insertBuffer()
                    }
                } else {
                    send(response)
                }
            }
        })


        dnsServerContext.server.on('request', (request, response, rinfo) => {
            //debugMessage(`DNS: request`, request.header.id, request.questions[0])
        })

        dnsServerContext.server.on('requestError', (error) => {
            console.log('DNS: Client sent an invalid request', error)
        })

        dnsServerContext.server.on('listening', async () => {
            console.log('DNS: listening', dnsServerContext.server.addresses())
            dnsServerContext.gatewayIp = await getGatewayIp(true)
            Hook.call('dnsready', {db,context})
        })

        dnsServerContext.server.on('close', () => {
            console.log('DNS: server closed')
        })

        dnsServerContext.server.on('error', (e) => {
            console.log('DNS: server error', e)
        })

        dnsServerContext.server.listen({
            // Optionally specify port, address and/or the family of socket() for udp server:
            udp: {
                port: 53,
                address: '0.0.0.0',
                type: 'udp4',  // IPv4 or IPv6 (Must be either "udp4" or "udp6")
            },
            // Optionally specify port and/or address for tcp server:
            /* tcp: {
                 port: 53,
                 address: "0.0.0.0",
             },*/
        })

        // eventually
        // server.close();
    }else{
        Hook.call('dnsready', {db,context})
    }
})

// Hook when the type CronJob has changed
Hook.on('typeUpdated_DnsHost', ({result}) => {
    if (result.name && dnsServerContext.hosts[result.name]) {
        if(result.group !== undefined) {
            dnsServerContext.hosts[result.name].group = result.group
        }
        dnsServerContext.hosts[result.name].response = parseOrElse(result.response)

        if (result.block !== undefined) {
            dnsServerContext.hosts[result.name].block = result.block
        }
        if (result.subdomains !== undefined) {
            dnsServerContext.hosts[result.name].subdomains = result.subdomains
        }
        // Promote out of the ephemeral pool now that it carries real config.
        if (dnsServerContext.hosts[result.name]._ephemeral) {
            delete dnsServerContext.hosts[result.name]._ephemeral
            ephemeralHosts.delete(result.name)
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

const debugMessage = (msg, details) => {
    if (dnsServerContext.settings.debug) {
        if(details) {
            console.debug(msg, details)
        }else{
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
            delete dnsServerContext.dbBuffer[oldest]
        }
    }
}

const ERROR_ANSWER = () => ({header: {}, authorities: [], additionals: [], answers: [], isError: true})

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
// without this every query opens its own dns2 lookup -> unbounded UDP sockets /
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

const scheduleUpstream = (question, cacheKey) => {
    return new Promise((resolve) => {
        const job = () => {
            activeUpstream++
            doResolveUpstream(question, cacheKey)
                .then(resolve, () => resolve(ERROR_ANSWER()))
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
            console.warn(`DNS: resolve queue full (${upstreamQueue.length}), shedding ${question.name}`)
            resolve(ERROR_ANSWER())
        }
    })
}
// ----------------------------------------------------------------------------

const resolveDnsQuestion = async (question) => {
    const cacheKey = `${question.name}${question.type}${question.class}`

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

    const resolvePromise = scheduleUpstream(question, cacheKey)
    pendingResolves.set(cacheKey, resolvePromise)
    try {
        return await resolvePromise
    } finally {
        pendingResolves.delete(cacheKey)
    }
}

const doResolveUpstream = async (question, cacheKey) => {
    const dnsServer = dnsServerContext.settings.dns || '8.8.8.8'
    if (!dnsResolvers[dnsServer]) {
        dnsResolvers[dnsServer] = new dns2({
            dns: dnsServer,
            recursive: false
        })
    }
    const typeName = dnsServerContext.typeMap[question.type]

    let answer;
    let timeoutHandle
    const timeoutMs = dnsServerContext.settings.resolveTimeout || 5000

    try {
        answer = await Promise.race([
            dnsResolvers[dnsServer].resolve(question.name, typeName, question.class),
            new Promise((_, reject) => {
                timeoutHandle = setTimeout(
                    () => reject(Object.assign(
                        new Error(`DNS timeout after ${timeoutMs}ms for ${question.name}`),
                        {code: 'ETIMEDOUT'}
                    )),
                    timeoutMs
                )
            })
        ])
    } catch (err) {
        if (err.code === 'ETIMEDOUT') {
            throttledWarn('upstream-timeout', `DNS: timeout resolving via ${dnsServer}`)
        } else {
            throttledWarn('upstream-error', `DNS: error resolving via ${dnsServer}: ${err.message}`)
        }
        answer = ERROR_ANSWER();
    } finally {
        // Always clear the race timer on success, otherwise tens of thousands of
        // pending timers pile up under load.
        if (timeoutHandle) {
            clearTimeout(timeoutHandle)
        }
    }

    // Lazy TTL: store an expiry timestamp instead of one setTimeout per entry.
    // Removes timer accumulation and the bug where a stale TTL timer deletes a
    // newer entry that reused the same key after FIFO eviction.
    const cacheDuration = answer.isError ? 5000 : 30000 // 5s errors, 30s hits
    dnsCachedAnswers.set(cacheKey, {answer, expiresAt: Date.now() + cacheDuration})

    const maxNumbersOfCachedAnswers = dnsServerContext.settings.cacheSize || 1000
    if (dnsCachedAnswers.size > maxNumbersOfCachedAnswers) {
        const oldestKey = dnsCachedAnswers.keys().next().value
        dnsCachedAnswers.delete(oldestKey)
    }

    return answer;
}

const readHosts = async (db) => {
    await db.collection('DnsHost').find().forEach(o => {
        const entry = {
            block: o.block,
            subdomains: o.subdomains,
            count: o.count,
            response: o.response,
            group: o.group
        }
        // Hosts stored purely for usage stats (no block/subdomain/group/response)
        // are ephemeral and subject to the in-memory cap.
        const isConfigured = o.block === true || o.subdomains === true ||
            (o.group && o.group.length > 0) || !!o.response
        if (!isConfigured) {
            entry._ephemeral = true
        }
        dnsServerContext.hosts[o.name] = entry
        if (!isConfigured) {
            trackEphemeralHost(o.name)
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
    const values = Object.values(dnsServerContext.dbBuffer)
    if (values.length === 0) {
        return
    }
    // Snapshot & clear before the async write so concurrent requests accumulate
    // into a fresh buffer instead of being lost or written twice.
    dnsServerContext.dbBuffer = {}
    insertingBuffer = true
    try {
        await dnsServerContext.database.collection('DnsHost').bulkWrite(values, {ordered: false})
    } catch (e) {
        console.warn('DNS: insertBuffer failed', e.message)
    } finally {
        insertingBuffer = false
    }
}