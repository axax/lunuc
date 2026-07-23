// server/util/asnBlocker.mjs
//
// ASN-based bot mitigation - targeted variant.
//
// Philosophy: do NOT block "all datacenters". Only block ASNs that are
// explicitly configured per hostrule (blockAsns), optionally seeded with
// a small list of notorious scraper/proxy ASNs. Which ASNs are "bad" for
// YOUR traffic is determined from your own data: run with "mode": "log"
// first, inspect the collected per-ASN stats via the asnstats admin
// command, then add the offenders to blockAsns in the hostrule - no
// redeploy needed.
//
// Dry run: blockAsns can be populated while mode is still "log" - nothing
// is blocked, but listedHits in the stats shows exactly how many requests
// the list WOULD have caught. Verify the numbers, then switch the mode.
//
// The GeoLite2-ASN database is self-managed: downloaded automatically from
// the P3TERX mirror (republishes official MaxMind GeoLite2 releases),
// validated, atomically swapped, refreshed periodically. Fails soft: no
// db = every check returns 'allow'.
//
// Env overrides:
//   LUNUC_ASN_DB          absolute path to the mmdb file
//   LUNUC_ASN_DB_URL      alternative download url
//   LUNUC_ASN_DB_MAX_AGE  max db age in ms before a refresh is triggered
//
// Hostrule config example:
//   "asnPolicy": {
//     "mode": "log",                   // start here! then "throttle" | "block"
//     "pathRegex": "^/graphql|^/produktfinder",  // optional, default: all paths
//     "blockAsns": [135377, 396356],   // YOUR curated list - the actual policy
//     "useNotoriousList": false,       // opt-in seed list of notorious ASNs
//     "allowAsns": [],                 // exceptions, wins over everything
//     "requestPerTime": 5,             // throttle mode: allowed requests
//     "requestTimeInMs": 60000         //   ...per this window
//   }

import path from 'path'
import fs from 'fs'
import dns from 'dns'
import {pipeline} from 'stream/promises'
import maxmind from 'maxmind'
import Cache from '../../util/cache.mjs'
import {ensureDirectoryExistence} from '../../util/fileUtil.mjs'
import {isTemporarilyBlocked} from './requestBlocker.mjs'

const DB_PATH = process.env.LUNUC_ASN_DB ||
    path.join(path.resolve(), 'server/geo/GeoLite2-ASN.mmdb')

const DB_URL = process.env.LUNUC_ASN_DB_URL ||
    'https://github.com/P3TERX/GeoLite.mmdb/releases/latest/download/GeoLite2-ASN.mmdb'

// MaxMind releases twice a week -> refreshing every 3 days keeps us at
// most one release behind
const UPDATE_INTERVAL_MS = parseInt(process.env.LUNUC_ASN_DB_MAX_AGE) || 3 * 24 * 3600 * 1000
const DOWNLOAD_TIMEOUT_MS = 60000
const MIN_VALID_SIZE = 1024 * 1024 // real ASN db is ~10MB, below 1MB is garbage

// Small opt-in seed list: ASNs that carry almost exclusively scraper, proxy
// and abuse traffic and virtually never real shop visitors. Deliberately
// does NOT contain general-purpose clouds (AWS, Azure, GCP, Hetzner, OVH,
// DigitalOcean...) - those host legitimate services (monitoring, payment
// callbacks, corporate VPNs) alongside the bad actors. Verify entries on
// bgp.he.net before relying on them; prefer your own measured blockAsns.
const NOTORIOUS_ASNS = new Set([
    9009,   // M247 Europe - vpn/proxy exit heavy
    212238, // Datacamp/CDN77 - vpn/proxy exit heavy
    206092, // IPXO / leased ranges, frequent abuse source
    202425, // IP Volume Inc - bulletproof-ish, spam/scan heavy
    204428, // SS-Net - scan/abuse heavy
    208091, // XHOST Internet Solutions - abuse heavy
    135377, // UCloud HK - scraper heavy
    136907, // Huawei Cloud HK - scraper heavy
    132203, // Tencent Cloud - scraper heavy towards EU shops
    45102,  // Alibaba Cloud - scraper heavy towards EU shops
    396356, // Latitude.sh - scraper pools
    62904   // Eonix - scan/abuse heavy
])

// Crawlers verified via reverse+forward DNS always pass, whatever the lists say
const VERIFIED_CRAWLER_DOMAINS = [
    '.googlebot.com', '.google.com',
    '.search.msn.com',
    '.crawl.yahoo.net',
    '.applebot.apple.com',
    '.duckduckgo.com'
]

const DNS_VERIFY_TTL = 6 * 3600 * 1000
// explicit timeout: default resolver settings (5s, 4 tries) could hold a
// request for ~20s on a dead PTR server. 2s/1 try is plenty for a local
// resolver; a failed lookup simply means "not verified" (fail closed for
// listed ips) and both outcomes are cached anyway
const dnsResolver = new dns.promises.Resolver({timeout: 2000, tries: 1})
dnsResolver.setServers(dns.getServers())

let lookup = null
let updateTimer = null
let downloadInFlight = null

// compiled pathRegex cache. Also caches null for INVALID patterns so a
// config typo is logged once instead of throwing on every request
const pathRegexCache = new Map()


/* ------------------------------------------------------------------ */
/* ASN statistics - the data source for YOUR blockAsns list             */
/* ------------------------------------------------------------------ */

// In-memory, per ASN: request count, distinct ips (capped), top paths,
// top user agents, blocked + listed counts. Intentionally simple - it
// answers one question: "which ASNs are conspicuous on this server?"
// NOTE: in-memory means a restart resets the numbers.
const STATS_MAX_ASNS = 2000
const asnStats = new Map()

const bumpCapped = (map, key, maxSize) => {
    map.set(key, (map.get(key) || 0) + 1)
    if (map.size > maxSize) {
        // drop the least used entry to keep the map bounded
        let minKey, minVal = Infinity
        for (const [k, v] of map) {
            if (v < minVal) { minVal = v; minKey = k }
        }
        map.delete(minKey)
    }
}

const recordAsnStats = ({asn, org, ip, urlPathname, userAgent, action, isListed}) => {
    let entry = asnStats.get(asn)
    if (!entry) {
        if (asnStats.size >= STATS_MAX_ASNS) {
            return // cap reached - keep counting known ones only
        }
        entry = {org, requests: 0, blocked: 0, listedHits: 0, ips: new Set(), paths: new Map(), agents: new Map()}
        asnStats.set(asn, entry)
    }
    entry.requests++
    if (action !== 'allow') {
        entry.blocked++
    }
    if (isListed) {
        // counts hits on the block list regardless of mode: in log mode
        // this is the dry run ("how many requests WOULD the list catch"),
        // in throttle mode it additionally shows the allowed-through share
        entry.listedHits++
    }
    if (entry.ips.size < 200) {
        entry.ips.add(ip)
    }
    if (urlPathname) {
        bumpCapped(entry.paths, urlPathname, 50)
    }
    if (userAgent) {
        bumpCapped(entry.agents, userAgent.substring(0, 120), 20)
    }
}

const topN = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([key, count]) => ({key, count}))

/**
 * Snapshot of collected stats, sorted by request volume. After a day of
 * "mode": "log" the conspicuous ASNs are obvious: high volume with few
 * ips (hammering) or many ips with uniform agents (distributed scraping),
 * topPaths full of product finder / facet urls.
 */
export const getAsnStats = ({limit = 30} = {}) => {
    return [...asnStats.entries()]
        .sort((a, b) => b[1].requests - a[1].requests)
        .slice(0, limit)
        .map(([asn, e]) => ({
            asn,
            org: e.org,
            requests: e.requests,
            blocked: e.blocked,
            listedHits: e.listedHits,
            distinctIps: e.ips.size,
            requestsPerIp: Math.round(e.requests / Math.max(1, e.ips.size)),
            topPaths: topN(e.paths, 5),
            topAgents: topN(e.agents, 3)
        }))
}

export const resetAsnStats = () => asnStats.clear()


/* ------------------------------------------------------------------ */
/* Database download / refresh                                          */
/* ------------------------------------------------------------------ */

const downloadDb = () => {
    if (downloadInFlight) {
        return downloadInFlight
    }
    downloadInFlight = (async () => {
        const tmpFile = `${DB_PATH}.tmp-${process.pid}-${Date.now()}`
        const abort = new AbortController()
        const timeout = setTimeout(() => abort.abort(), DOWNLOAD_TIMEOUT_MS)
        try {
            console.log(`asnBlocker: downloading ${DB_URL}`)
            const response = await fetch(DB_URL, {
                signal: abort.signal,
                headers: {'User-Agent': 'lunuc-asn-blocker'}
            })
            if (!response.ok || !response.body) {
                throw new Error(`unexpected response ${response.status}`)
            }
            await pipeline(response.body, fs.createWriteStream(tmpFile))

            // validation 1: plausible size
            const stats = await fs.promises.stat(tmpFile)
            if (stats.size < MIN_VALID_SIZE) {
                throw new Error(`downloaded file too small (${stats.size} bytes)`)
            }
            // validation 2: parseable mmdb that resolves a known ip
            const candidate = await maxmind.open(tmpFile)
            const probe = candidate.get('8.8.8.8')
            if (!probe || !probe.autonomous_system_number) {
                throw new Error('downloaded db failed the probe lookup')
            }

            // atomic swap on disk, then swap the in-memory instance
            await fs.promises.rename(tmpFile, DB_PATH)
            lookup = candidate
            console.log(`asnBlocker: db updated (${(stats.size / 1048576).toFixed(1)} MB, probe AS${probe.autonomous_system_number})`)
            return true
        } catch (e) {
            console.warn(`asnBlocker: db download failed - ${e.message}`)
            fs.promises.unlink(tmpFile).catch(() => {})
            return false
        } finally {
            clearTimeout(timeout)
            downloadInFlight = null
        }
    })()
    return downloadInFlight
}

const isDbStale = async () => {
    try {
        const stats = await fs.promises.stat(DB_PATH)
        return Date.now() - stats.mtime.getTime() > UPDATE_INTERVAL_MS
    } catch (e) {
        return true // missing = stale
    }
}

/**
 * Call once at server startup. NEVER blocks the server start:
 * - existing valid db  -> loaded synchronously (local mmdb parse, ~50ms)
 * - missing/broken db  -> download runs in the background; until it
 *   completes, checkAsnPolicy fails soft (returns 'allow' for everything).
 *   On a first start this leaves a gap of a few seconds without ASN
 *   checks - acceptable, since the check is an optimization, not a
 *   security gate, and a server start must not depend on github being up.
 * A periodic timer keeps the db fresh afterwards.
 */
export const initAsnBlocker = async () => {
    if (!ensureDirectoryExistence(path.dirname(DB_PATH), true)) {
        console.warn(`asnBlocker: cannot create ${path.dirname(DB_PATH)} - ASN checks disabled`)
        return
    }

    const existing = await fs.promises.stat(DB_PATH).catch(() => null)
    if (existing && existing.isFile() && existing.size >= MIN_VALID_SIZE) {
        try {
            lookup = await maxmind.open(DB_PATH)
            console.log(`asnBlocker: loaded existing db (${(existing.size / 1048576).toFixed(1)} MB)`)
        } catch (e) {
            console.warn(`asnBlocker: existing db unreadable (${e.message}) - re-downloading in background`)
        }
    }

    if (!lookup) {
        // no usable db: download in the BACKGROUND - do not hold up the
        // server start. Until the download finishes, all checks return
        // 'allow' (fail soft). Log the outcome so a silent failure is
        // visible in the startup log.
        downloadDb().then(ok => {
            if (!ok) {
                console.warn('asnBlocker: initial db download failed - ASN checks stay disabled until the next retry')
            }
        })
    } else if (await isDbStale()) {
        downloadDb()
    }

    updateTimer = setInterval(async () => {
        if (await isDbStale()) {
            downloadDb()
        }
    }, 6 * 3600 * 1000)
    updateTimer.unref()
}


/* ------------------------------------------------------------------ */
/* Lookups & policy                                                     */
/* ------------------------------------------------------------------ */

/**
 * @returns {{asn:number, org:string}|null}
 */
export const getAsn = (ip) => {
    if (!lookup || !ip) {
        return null
    }
    try {
        const result = lookup.get(ip)
        if (result && result.autonomous_system_number) {
            return {asn: result.autonomous_system_number, org: result.autonomous_system_organization || ''}
        }
    } catch (e) {
        // malformed ip etc. - treat as unknown
    }
    return null
}

export const isNotoriousAsn = (asn) => NOTORIOUS_ASNS.has(asn)

/**
 * Reverse DNS + forward confirmation. Both outcomes are cached, so the
 * DNS cost is paid once per ip per 6h, not per request.
 */
export const isVerifiedCrawler = async (ip) => {
    const cacheKey = 'asnCrawler-' + ip
    const cached = Cache.get(cacheKey)
    if (cached !== undefined && cached !== null) {
        return cached.verified
    }
    let verified = false
    try {
        const hostnames = await dnsResolver.reverse(ip)
        for (const hostname of hostnames) {
            if (VERIFIED_CRAWLER_DOMAINS.some(d => hostname.endsWith(d))) {
                // forward-confirm: hostname must resolve back to the same ip
                const records = ip.includes(':')
                    ? await dnsResolver.resolve6(hostname)
                    : await dnsResolver.resolve4(hostname)
                if (records.includes(ip)) {
                    verified = true
                    break
                }
            }
        }
    } catch (e) {
        // no PTR record / lookup failure / timeout -> not a verified crawler
    }
    Cache.set(cacheKey, {verified}, DNS_VERIFY_TTL)
    return verified
}

const getPathRegex = (pattern) => {
    let re = pathRegexCache.get(pattern)
    if (re === undefined) {
        try {
            re = new RegExp(pattern)
        } catch (e) {
            // a config typo must not take down the host - disable the path
            // scoping (= policy applies to all paths) and log once. null is
            // cached so this does not throw or log again on every request
            console.error(`asnBlocker: invalid pathRegex "${pattern}" - ignoring path scope (${e.message})`)
            re = null
        }
        pathRegexCache.set(pattern, re)
    }
    return re
}

/**
 * Main entry - call early in the request pipeline.
 *
 * Only ASNs in policy.blockAsns (plus, if opted in, the notorious seed
 * list) are affected at all. Everything else - including big clouds -
 * passes untouched. Stats are recorded for every resolvable ip so log
 * mode produces the data the blockAsns list is based on.
 *
 * @returns {Promise<{action:'allow'|'block'|'throttle-block', asn?:number, org?:string}>}
 */
export const checkAsnPolicy = async ({ip, urlPathname, userAgent, hostrule}) => {
    const policy = hostrule.asnPolicy
    if (!lookup || !policy || !ip) {
        return {action: 'allow'}
    }

    if (policy.pathRegex) {
        const re = getPathRegex(policy.pathRegex)
        if (re && !re.test(urlPathname)) {
            return {action: 'allow'}
        }
        // invalid pattern (re === null): fall through - policy applies to
        // all paths rather than silently to none
    }

    const asnInfo = getAsn(ip)
    if (!asnInfo) {
        return {action: 'allow'}
    }
    const {asn, org} = asnInfo

    let action = 'allow'

    const isListed = ((policy.blockAsns && policy.blockAsns.includes(asn)) ||
            (policy.useNotoriousList && NOTORIOUS_ASNS.has(asn))) &&
        !(policy.allowAsns && policy.allowAsns.includes(asn))

    if (isListed) {
        // verified search engine crawlers always pass, whatever the list says
        if (!(await isVerifiedCrawler(ip))) {
            if (policy.mode === 'block') {
                action = 'block'
            } else if (policy.mode === 'throttle') {
                if (isTemporarilyBlocked({
                    key: 'asn-' + ip,
                    requestPerTime: policy.requestPerTime || 5,
                    requestTimeInMs: policy.requestTimeInMs || 60000
                })) {
                    action = 'throttle-block'
                }
            }
            // mode 'log': action stays 'allow', the hit shows up in
            // listedHits (dry run)
        }
    }

    recordAsnStats({asn, org, ip, urlPathname, userAgent, action, isListed})

    return {action, asn, org}
}