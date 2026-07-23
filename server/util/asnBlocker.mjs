// server/util/asnBlocker.mjs
//
// ASN- and country-based bot mitigation - targeted variant.
//
// Philosophy: do NOT block "all datacenters" or "all foreign countries".
// Only act on ASNs/countries explicitly configured per hostrule, optionally
// seeded with a small list of notorious scraper/proxy ASNs. Which ASNs or
// countries are "bad" for YOUR traffic is determined from your own data:
// run with "mode": "log" first, inspect the collected stats via the
// asnstats/countrystats admin commands, then add the offenders - no
// redeploy needed.
//
// Dry run: blockAsns/blockCountries can be populated while mode is still
// "log" - nothing is blocked, but listedHits in the stats shows exactly
// how many requests the list WOULD have caught. Verify the numbers, then
// switch the mode.
//
// Both GeoLite2-ASN and GeoLite2-Country are self-managed: downloaded
// automatically from the P3TERX mirror (republishes official MaxMind
// GeoLite2 releases), validated, atomically swapped, refreshed
// periodically. Fails soft: no db = every check returns 'allow'.
//
// Env overrides:
//   LUNUC_ASN_DB / LUNUC_ASN_DB_URL           ASN db path / download url
//   LUNUC_COUNTRY_DB / LUNUC_COUNTRY_DB_URL   Country db path / download url
//   LUNUC_ASN_DB_MAX_AGE                      max db age before refresh (both dbs)
//
// Hostrule config example - asnPolicy is a single object OR an array.
// Arrays let different ASN groups be treated differently: the first
// policy (in order) whose pathRegex matches AND whose ASN list contains
// the request's ASN wins - so you can e.g. hard-block a curated list of
// confirmed offenders while only throttling a broader/uncertain one.
//
//   "asnPolicy": [
//     {"mode": "block",    "blockAsns": [135377, 396356], "pathRegex": "^/graphql|^/produktfinder"},
//     {"mode": "throttle", "blockAsns": [30689], "requestPerTime": 20, "requestTimeInMs": 60000}
//   ]
//
// countryPolicy works the same way (single object or array). allowedCountries
// is allowlist-mode (anything NOT listed is flagged - the right model for a
// shop with a known, narrow customer base); blockCountries is denylist-mode
// (symmetric to blockAsns); exceptCountries always wins over both.
//
//   "countryPolicy": {
//     "mode": "throttle",
//     "allowedCountries": ["CH", "DE", "AT", "FR", "IT", "LI"],
//     "requestPerTime": 15,
//     "requestTimeInMs": 60000
//   }
//
// IMPORTANT before enabling block/throttle broadly by country: scope via
// pathRegex to the pages actually being scraped (product finder, graphql),
// and make sure payment provider callbacks/webhooks are NOT on the same
// path/host, or are covered by exceptCountries / allowAsns for the
// provider's known ranges. A shop with international payment processors
// can otherwise break its own checkout.

import path from 'path'
import fs from 'fs'
import dns from 'dns'
import {pipeline} from 'stream/promises'
import maxmind from 'maxmind'
import Cache from '../../util/cache.mjs'
import {ensureDirectoryExistence} from '../../util/fileUtil.mjs'
import {isTemporarilyBlocked} from './requestBlocker.mjs'

const DOWNLOAD_TIMEOUT_MS = 60000
const GEO_MIRROR_BASE = 'https://github.com/P3TERX/GeoLite.mmdb/releases/latest/download'

// MaxMind releases twice a week -> refreshing every 3 days keeps us at
// most one release behind. Shared by both dbs.
const UPDATE_INTERVAL_MS = parseInt(process.env.LUNUC_ASN_DB_MAX_AGE) || 3 * 24 * 3600 * 1000

// Generic per-db config: path, download url, minimum plausible file size,
// and a probe validator run against a known ip (8.8.8.8, Google Public DNS -
// always resolvable, stable ownership) to confirm the downloaded file is
// actually a working db of the right kind, not a corrupt/wrong download.
const DB_CONFIGS = {
    asn: {
        path: process.env.LUNUC_ASN_DB || path.join(path.resolve(), 'server/geo/GeoLite2-ASN.mmdb'),
        url: process.env.LUNUC_ASN_DB_URL || `${GEO_MIRROR_BASE}/GeoLite2-ASN.mmdb`,
        minSize: 1024 * 1024, // real ASN db is ~10MB, below 1MB is garbage
        probe: (result) => result && result.autonomous_system_number ? `AS${result.autonomous_system_number}` : null
    },
    country: {
        path: process.env.LUNUC_COUNTRY_DB || path.join(path.resolve(), 'server/geo/GeoLite2-Country.mmdb'),
        url: process.env.LUNUC_COUNTRY_DB_URL || `${GEO_MIRROR_BASE}/GeoLite2-Country.mmdb`,
        minSize: 512 * 1024, // Country db is smaller than ASN db, ~2-6MB
        probe: (result) => result?.country?.iso_code || null
    }
}

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


/* ------------------------------------------------------------------ */
/* Crawler verification: reverse+forward DNS (FCrDNS)                   */
/*                                                                       */
/* Works reliably for vendors that own stable, long-documented crawling  */
/* infrastructure (search engines). OpenAI and Anthropic are included as */
/* best-effort - they run mostly on rented cloud infra (AWS/Azure/GCP),  */
/* so their PTR records are NOT guaranteed to follow a fixed convention; */
/* treat those two as a weaker signal than the rest of the list.         */
/* Perplexity is deliberately NOT included - no stable PTR convention is */
/* documented for it, and Cloudflare has documented undeclared/rotating  */
/* Perplexity crawlers besides, so a fabricated entry here would be      */
/* worse than no entry (false confidence). Unverified AI-bot traffic     */
/* from a listed ASN/country is simply treated like any other bot.       */
/* ------------------------------------------------------------------ */

const DNS_VERIFIED_CRAWLER_DOMAINS = [
    // --- established, high confidence: vendor owns dedicated crawl infra ---
    '.googlebot.com', '.google.com',          // Googlebot (incl. Google-Extended/AI Overviews - same crawler)
    '.search.msn.com',                        // Bingbot
    '.crawl.yahoo.net',                       // Yahoo Slurp
    '.applebot.apple.com',                    // Applebot (incl. Applebot-Extended - same crawler)
    '.duckduckgo.com',                        // DuckDuckBot / DuckAssistBot
    '.yandex.com', '.yandex.ru', '.yandex.net', // YandexBot
    '.baidu.com', '.baidu.jp',                 // Baiduspider
    '.sogou.com',                              // Sogou Spider

    // --- best-effort only, see caveat above ---
    '.openai.com',     // GPTBot / ChatGPT-User / OAI-SearchBot
    '.anthropic.com'   // ClaudeBot / Claude-User / Claude-SearchBot
]

const DNS_VERIFY_TTL = 6 * 3600 * 1000
// explicit timeout: default resolver settings (5s, 4 tries) could hold a
// request for ~20s on a dead PTR server. 2s/1 try is plenty for a local
// resolver; a failed lookup simply means "not verified" (fail closed for
// listed ips) and both outcomes are cached anyway
const dnsResolver = new dns.promises.Resolver({timeout: 2000, tries: 1})
dnsResolver.setServers(dns.getServers())

const isDnsVerifiedCrawler = async (ip) => {
    try {
        const hostnames = await dnsResolver.reverse(ip)
        for (const hostname of hostnames) {
            if (DNS_VERIFIED_CRAWLER_DOMAINS.some(d => hostname.endsWith(d))) {
                // forward-confirm: hostname must resolve back to the same ip
                const records = ip.includes(':')
                    ? await dnsResolver.resolve6(hostname)
                    : await dnsResolver.resolve4(hostname)
                if (records.includes(ip)) {
                    return true
                }
            }
        }
    } catch (e) {
        // no PTR record / lookup failure / timeout -> not verified this way
    }
    return false
}

/**
 * Reverse+forward DNS verification. Result is cached, so the DNS cost is
 * paid once per ip per 6h, not per request.
 */
export const isVerifiedCrawler = async (ip) => {
    const cacheKey = 'asnCrawler-' + ip
    const cached = Cache.get(cacheKey)
    if (cached !== undefined && cached !== null) {
        return cached.verified
    }

    const verified = await isDnsVerifiedCrawler(ip)
    Cache.set(cacheKey, {verified}, DNS_VERIFY_TTL)
    return verified
}


/* ------------------------------------------------------------------ */
/* Generic GeoLite2 mmdb management (shared by ASN and Country db)      */
/* ------------------------------------------------------------------ */

const mmdbLookups = {asn: null, country: null}
const mmdbDownloadInFlight = {asn: null, country: null}

const downloadMmdb = (dbKey) => {
    if (mmdbDownloadInFlight[dbKey]) {
        return mmdbDownloadInFlight[dbKey]
    }
    const cfg = DB_CONFIGS[dbKey]
    mmdbDownloadInFlight[dbKey] = (async () => {
        const tmpFile = `${cfg.path}.tmp-${process.pid}-${Date.now()}`
        const abort = new AbortController()
        const timeout = setTimeout(() => abort.abort(), DOWNLOAD_TIMEOUT_MS)
        try {
            console.log(`asnBlocker: downloading ${dbKey} db from ${cfg.url}`)
            const response = await fetch(cfg.url, {
                signal: abort.signal,
                headers: {'User-Agent': 'lunuc-asn-blocker'}
            })
            if (!response.ok || !response.body) {
                throw new Error(`unexpected response ${response.status}`)
            }
            await pipeline(response.body, fs.createWriteStream(tmpFile))

            const stats = await fs.promises.stat(tmpFile)
            if (stats.size < cfg.minSize) {
                throw new Error(`downloaded file too small (${stats.size} bytes)`)
            }
            const candidate = await maxmind.open(tmpFile)
            const probeResult = cfg.probe(candidate.get('8.8.8.8'))
            if (!probeResult) {
                throw new Error('downloaded db failed the probe lookup')
            }

            await fs.promises.rename(tmpFile, cfg.path)
            mmdbLookups[dbKey] = candidate
            console.log(`asnBlocker: ${dbKey} db updated (${(stats.size / 1048576).toFixed(1)} MB, probe ${probeResult})`)
            return true
        } catch (e) {
            console.warn(`asnBlocker: ${dbKey} db download failed - ${e.message}`)
            fs.promises.unlink(tmpFile).catch(() => {})
            return false
        } finally {
            clearTimeout(timeout)
            mmdbDownloadInFlight[dbKey] = null
        }
    })()
    return mmdbDownloadInFlight[dbKey]
}

const isMmdbStale = async (dbKey) => {
    try {
        const stats = await fs.promises.stat(DB_CONFIGS[dbKey].path)
        return Date.now() - stats.mtime.getTime() > UPDATE_INTERVAL_MS
    } catch (e) {
        return true // missing = stale
    }
}

const initMmdb = async (dbKey) => {
    const cfg = DB_CONFIGS[dbKey]
    if (!ensureDirectoryExistence(path.dirname(cfg.path), true)) {
        console.warn(`asnBlocker: cannot create ${path.dirname(cfg.path)} - ${dbKey} checks disabled`)
        return
    }

    const existing = await fs.promises.stat(cfg.path).catch(() => null)
    if (existing && existing.isFile() && existing.size >= cfg.minSize) {
        try {
            mmdbLookups[dbKey] = await maxmind.open(cfg.path)
            console.log(`asnBlocker: loaded existing ${dbKey} db (${(existing.size / 1048576).toFixed(1)} MB)`)
        } catch (e) {
            console.warn(`asnBlocker: existing ${dbKey} db unreadable (${e.message}) - re-downloading in background`)
        }
    }

    if (!mmdbLookups[dbKey]) {
        // no usable db: download in the BACKGROUND - never hold up server
        // start. Until it completes, checks for this db return 'allow'.
        downloadMmdb(dbKey).then(ok => {
            if (!ok) {
                console.warn(`asnBlocker: initial ${dbKey} db download failed - checks stay disabled until the next retry`)
            }
        })
    } else if (await isMmdbStale(dbKey)) {
        downloadMmdb(dbKey)
    }
}

/**
 * Call once at server startup. NEVER blocks the server start:
 * - existing valid dbs -> loaded synchronously (local mmdb parse, ~50ms each)
 * - missing/broken db  -> download runs in the background per db; until it
 *   completes, the corresponding checks fail soft (return 'allow').
 * Also starts the periodic refresh timer for both mmdbs.
 */
export const initAsnBlocker = async () => {
    await initMmdb('asn')
    await initMmdb('country')

    const timer = setInterval(async () => {
        for (const dbKey of Object.keys(DB_CONFIGS)) {
            if (await isMmdbStale(dbKey)) {
                downloadMmdb(dbKey)
            }
        }
    }, 6 * 3600 * 1000)
    timer.unref()
}


/* ------------------------------------------------------------------ */
/* Lookups                                                              */
/* ------------------------------------------------------------------ */

/**
 * @returns {{asn:number, org:string}|null}
 */
export const getAsn = (ip) => {
    const lookup = mmdbLookups.asn
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

/**
 * @returns {{code:string, name:string}|null}
 */
export const getCountry = (ip) => {
    const lookup = mmdbLookups.country
    if (!lookup || !ip) {
        return null
    }
    try {
        const result = lookup.get(ip)
        if (result?.country?.iso_code) {
            return {code: result.country.iso_code, name: result.country.names?.en || ''}
        }
        // anycast/satellite/some mobile ranges only carry registered_country -
        // fall back to it rather than treating the ip as unresolvable
        if (result?.registered_country?.iso_code) {
            return {code: result.registered_country.iso_code, name: result.registered_country.names?.en || ''}
        }
    } catch (e) {
        // malformed ip etc. - treat as unknown
    }
    return null
}


/* ------------------------------------------------------------------ */
/* Shared stats tracker (used identically for ASN and country stats)    */
/* ------------------------------------------------------------------ */

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

const topN = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([key, count]) => ({key, count}))

const createStatsTracker = ({maxKeys = 2000} = {}) => {
    const stats = new Map()

    const record = ({key, label, ip, urlPathname, userAgent, action, isListed}) => {
        let entry = stats.get(key)
        if (!entry) {
            if (stats.size >= maxKeys) {
                return // cap reached - keep counting known keys only
            }
            entry = {label, requests: 0, blocked: 0, listedHits: 0, ips: new Set(), paths: new Map(), agents: new Map()}
            stats.set(key, entry)
        }
        entry.requests++
        if (action !== 'allow') {
            entry.blocked++
        }
        if (isListed) {
            // counts hits regardless of mode: in log mode this is the dry
            // run ("how many requests WOULD the list catch"), in throttle
            // mode it additionally shows the allowed-through share
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

    const getStats = ({limit = 30} = {}) => [...stats.entries()]
        .sort((a, b) => b[1].requests - a[1].requests)
        .slice(0, limit)
        .map(([key, e]) => ({
            key,
            label: e.label,
            requests: e.requests,
            blocked: e.blocked,
            listedHits: e.listedHits,
            distinctIps: e.ips.size,
            requestsPerIp: Math.round(e.requests / Math.max(1, e.ips.size)),
            topPaths: topN(e.paths, 5),
            topAgents: topN(e.agents, 3)
        }))

    const reset = () => stats.clear()

    return {record, getStats, reset}
}

const asnStatsTracker = createStatsTracker()
const countryStatsTracker = createStatsTracker()

// NOTE: field names (asn/org) preserved for backward compatibility with
// existing jq queries/dashboards against the asnstats endpoint.
export const getAsnStats = ({limit = 30} = {}) =>
    asnStatsTracker.getStats({limit}).map(({key, label, ...rest}) => ({asn: key, org: label, ...rest}))

export const resetAsnStats = () => asnStatsTracker.reset()

export const getCountryStats = ({limit = 30} = {}) =>
    countryStatsTracker.getStats({limit}).map(({key, label, ...rest}) => ({country: key, name: label, ...rest}))

export const resetCountryStats = () => countryStatsTracker.reset()


/* ------------------------------------------------------------------ */
/* Policy evaluation - path regex cache (shared by asn + country)       */
/* ------------------------------------------------------------------ */

// compiled pathRegex cache. Also caches null for INVALID patterns so a
// config typo is logged once instead of throwing on every request
const pathRegexCache = new Map()

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

// accepts a single policy object OR an array - normalizes to array so both
// checkAsnPolicy and checkCountryPolicy can iterate uniformly
const normalizePolicies = (policy) => {
    if (!policy) {
        return []
    }
    return Array.isArray(policy) ? policy : [policy]
}


/* ------------------------------------------------------------------ */
/* ASN policy                                                           */
/* ------------------------------------------------------------------ */

/**
 * Main entry - call early in the request pipeline.
 *
 * hostrule.asnPolicy may be a single policy object or an array of them.
 * Policies are evaluated in order; the FIRST policy whose pathRegex scope
 * matches (or has none) AND whose blockAsns/notorious list contains the
 * request's ASN wins - this lets different ASN groups be treated
 * differently (e.g. a curated confirmed-offender list -> block, a
 * broader/uncertain list -> throttle only).
 *
 * @returns {Promise<{action:'allow'|'block'|'throttle-block', asn?:number, org?:string}>}
 */
export const checkAsnPolicy = async ({ip, urlPathname, userAgent, hostrule}) => {
    const policies = normalizePolicies(hostrule.asnPolicy)
    if (!mmdbLookups.asn || !policies.length || !ip) {
        return {action: 'allow'}
    }

    const asnInfo = getAsn(ip)
    if (!asnInfo) {
        return {action: 'allow'}
    }
    const {asn, org} = asnInfo

    let matchedPolicy = null
    for (const policy of policies) {
        if (policy.pathRegex) {
            const re = getPathRegex(policy.pathRegex)
            if (re && !re.test(urlPathname)) {
                continue // out of scope for this policy - try the next one
            }
        }
        const isListed = ((policy.blockAsns && policy.blockAsns.includes(asn)) ||
                (policy.useNotoriousList && NOTORIOUS_ASNS.has(asn))) &&
            !(policy.allowAsns && policy.allowAsns.includes(asn))
        if (isListed) {
            matchedPolicy = policy
            break // first match wins
        }
    }

    let action = 'allow'
    if (matchedPolicy) {
        // verified search engine / ai crawlers always pass, whatever the list says
        if (!(await isVerifiedCrawler(ip))) {
            if (matchedPolicy.mode === 'block') {
                action = 'block'
            } else if (matchedPolicy.mode === 'throttle') {
                if (isTemporarilyBlocked({
                    key: 'asn-' + ip, // distinct prefix from country throttle - see below
                    requestPerTime: matchedPolicy.requestPerTime || 5,
                    requestTimeInMs: matchedPolicy.requestTimeInMs || 60000
                })) {
                    action = 'throttle-block'
                }
            }
            // mode 'log' (or missing): action stays 'allow', the hit still
            // shows up in listedHits (dry run)
        }
    }

    asnStatsTracker.record({key: asn, label: org, ip, urlPathname, userAgent, action, isListed: !!matchedPolicy})

    return {action, asn, org}
}


/* ------------------------------------------------------------------ */
/* Country policy                                                       */
/* ------------------------------------------------------------------ */

const isCountryListed = (policy, code) => {
    if (policy.exceptCountries && policy.exceptCountries.includes(code)) {
        return false // explicit exception always wins
    }
    const flaggedByBlocklist = policy.blockCountries && policy.blockCountries.includes(code)
    const flaggedByAllowlist = policy.allowedCountries && !policy.allowedCountries.includes(code)
    return !!(flaggedByBlocklist || flaggedByAllowlist)
}

/**
 * Same shape and semantics as checkAsnPolicy, based on country instead of
 * ASN. hostrule.countryPolicy may be a single object or an array; first
 * matching policy (by pathRegex scope + isCountryListed) wins.
 *
 * @returns {Promise<{action:'allow'|'block'|'throttle-block', country?:string, countryName?:string}>}
 */
export const checkCountryPolicy = async ({ip, urlPathname, userAgent, hostrule}) => {
    const policies = normalizePolicies(hostrule.countryPolicy)
    if (!mmdbLookups.country || !policies.length || !ip) {
        return {action: 'allow'}
    }

    const countryInfo = getCountry(ip)
    if (!countryInfo) {
        return {action: 'allow'}
    }
    const {code, name} = countryInfo

    let matchedPolicy = null
    for (const policy of policies) {
        if (policy.pathRegex) {
            const re = getPathRegex(policy.pathRegex)
            if (re && !re.test(urlPathname)) {
                continue
            }
        }
        if (isCountryListed(policy, code)) {
            matchedPolicy = policy
            break
        }
    }

    let action = 'allow'
    if (matchedPolicy) {
        if (!(await isVerifiedCrawler(ip))) {
            if (matchedPolicy.mode === 'block') {
                action = 'block'
            } else if (matchedPolicy.mode === 'throttle') {
                if (isTemporarilyBlocked({
                    key: 'country-' + ip, // distinct prefix - a single ip must
                    // not share/double-count a bucket with the asn throttle
                    // above, the same bug we fixed for the two index checks
                    requestPerTime: matchedPolicy.requestPerTime || 5,
                    requestTimeInMs: matchedPolicy.requestTimeInMs || 60000
                })) {
                    action = 'throttle-block'
                }
            }
        }
    }

    countryStatsTracker.record({key: code, label: name, ip, urlPathname, userAgent, action, isListed: !!matchedPolicy})

    return {action, country: code, countryName: name}
}

/**
 * Convenience wrapper for the common case: run the ASN check first (no
 * extra cost if asnPolicy isn't configured on the host), then the country
 * check, and return the first non-'allow' result. Kept separate from
 * checkAsnPolicy/checkCountryPolicy on purpose - they stay independent,
 * single-purpose functions with their own config surface (blockAsns vs.
 * allowedCountries) and their own stats tracker. This just gives the
 * request pipeline one call site instead of two.
 */
export const checkGeoPolicy = async (params) => {
    const asnResult = await checkAsnPolicy(params)
    if (asnResult.action !== 'allow') {
        return {...asnResult, type: 'asn'}
    }
    const countryResult = await checkCountryPolicy(params)
    if (countryResult.action !== 'allow') {
        return {...countryResult, type: 'country'}
    }
    return {action: 'allow'}
}