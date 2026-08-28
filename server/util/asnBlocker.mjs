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
// countryPolicy modes: "log" | "throttle" | "block" | "challenge".
// "challenge" shows a low-friction "confirm you are not a bot" interstitial
// (server/util/botChallenge.mjs) instead of throttling/blocking outright -
// a gentler gate for regions with negligible expected legitimate traffic
// but where an outright block feels too harsh.
//
//   "countryPolicy": [
//     {"mode": "throttle", "blockCountries": ["JM", "BR", ...], "requestPerTime": 5, "requestTimeInMs": 60000},
//     {"mode": "challenge", "allowedCountries": ["CH", "DE", "AT", "FR", "IT", "LI", ...]}
//   ]
//
// hostrule.geoExceptIps: [ip | cidr, ...] - a flat, hostrule-level exception
// list (mirrors hostrule.blockedIps, opposite direction). Accepts plain IPs
// and CIDR ranges ("85.208.96.0/22" for SEMrush's rotating crawler pool).
// list (mirrors the existing hostrule.blockedIps mechanism, just for the
// opposite direction). Any ip in this list is NEVER listed by asnPolicy or
// countryPolicy (throttle/block/challenge), regardless of its ASN or
// country - use this for specific, individually verified third-party
// services (site audit tools, uptime monitors, a specific crawler with no
// reliable dns/ip-range verification method - e.g. Bytespider, Cohere-ai,
// Diffbot, search.ch...) whose traffic you confirmed via asnstats/
// countrystats but that cannot be verified generically. The exception
// still shows up in stats as normal 'allow' traffic - only the listed/
// blocked/challenged classification is suppressed. Look up the exact ip
// via the "ips" field in asnstats/countrystats (log mode + a single test
// request from the service is usually enough to isolate it, especially
// when distinctIps is 1).
//
// IMPORTANT before enabling block/throttle/challenge broadly by country:
// scope via pathRegex to the pages actually being scraped (product finder,
// graphql), and make sure payment provider callbacks/webhooks are NOT on
// the same path/host, or are covered by exceptCountries / allowAsns /
// geoExceptIps for the provider's known ranges. A shop with international
// payment processors can otherwise break its own checkout.
//
// CRAWLER VERIFICATION IS INFRASTRUCTURE-BASED, NOT UA-BASED - a request
// only ever fails/passes based on WHICH NETWORK it comes from (dns PTR or
// published ip range), never based on the user-agent string it claims.
// This matters especially with a narrow allowedCountries (e.g. CH/DE/AT):
// nearly every major search/AI crawler (Google, Bing/Copilot, OpenAI,
// Anthropic, Meta, Amazon, Yandex...) runs from US/foreign datacenters and
// would otherwise be flagged by countryPolicy like any other foreign
// visitor - isVerifiedCrawler is what lets them through regardless. Two
// methods:
//   1. DNS_VERIFIED_CRAWLER_DOMAINS (reverse+forward dns) - since this
//      checks the IP's OWN infrastructure, it transparently covers ANY
//      product/crawler operated from that infrastructure, even ones not
//      explicitly named here.
//   2. IP_RANGE_CRAWLER_SOURCES (published CIDR lists) - for OpenAI and
//      Perplexity, who run on rented cloud infra with no stable PTR
//      convention, but who publish their crawler IP ranges directly.
//
// PERFORMANCE: isVerifiedCrawler is intentionally NOT run on every request.
// It only runs when a policy has already flagged the ip as listed - the
// rare path, not the hot path. A DNS reverse lookup can take up to ~2s on
// first sight of an unfamiliar ip (see DNS_VERIFY_TTL below), so running it
// unconditionally would add that latency risk to ordinary customer
// traffic. checkAsnPolicy/checkCountryPolicy expose the outcome as
// `isCrawler` in their return value, but it stays `null` ("not evaluated")
// whenever no policy matched - never forced just to populate the field.
//
// SCOPE IS DELIBERATELY LIMITED TO CRAWLERS THAT PROVIDE VISIBILITY VALUE
// (search engines, AI assistants that can cite/link back). Pure training-
// only scrapers with no visibility benefit (Bytespider/ByteDance, Common
// Crawl/CCBot, Cohere-ai, Diffbot, ...) are intentionally left unverified -
// they run on infrastructure that either has no documented verification
// method, or (Common Crawl) is verifiable but was excluded on purpose:
// it feeds training datasets, not direct citations, so it brings no
// traffic/visibility benefit here. Such traffic stays subject to whatever
// asnPolicy/countryPolicy already applies. If one is specifically wanted
// despite that, verify its actual source ip via asnstats/countrystats and
// allow it individually via geoExceptIps - exactly like the geochecker.net
// case. The same manual path applies to smaller/regional search engines
// with no documented verification method (e.g. search.ch) - check first
// whether they even get flagged at all (a swiss-hosted crawler likely
// already passes a CH-inclusive allowedCountries without needing any
// verification).

import path from 'path'
import fs from 'fs'
import net from 'net'
import dns from 'dns'
import {pipeline} from 'stream/promises'
import maxmind from 'maxmind'
import Cache from '../../util/cache.mjs'
import {ensureDirectoryExistence} from '../../util/fileUtil.mjs'
import {isTemporarilyBlocked} from './requestBlocker.mjs'
import {isChallengePassed} from './botChallenge.mjs'

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
/* Crawler verification, method 1: reverse+forward DNS (FCrDNS)         */
/*                                                                       */
/* Works reliably for vendors that own stable, long-documented crawling  */
/* infrastructure - the check is IP/PTR based, so it automatically       */
/* covers every product/crawler that vendor runs from that network,      */
/* not just the specific bot names listed in the comments below.         */
/* ------------------------------------------------------------------ */

const DNS_VERIFIED_CRAWLER_DOMAINS = [
    // --- established, high confidence: vendor owns dedicated crawl infra,
    // pattern is officially documented by the vendor itself ---
    '.googlebot.com', '.google.com',          // Googlebot, Google-Extended, and any
    // Gemini/AI Overviews fetcher sharing this infra
    '.search.msn.com',                        // Bingbot; Microsoft Copilot's web grounding is
    // widely believed to share Bing's crawl infra, but
    // this is not separately documented by Microsoft -
    // treat the Copilot coverage as reasonably likely,
    // not guaranteed
    '.crawl.yahoo.net',                       // Yahoo Slurp
    '.applebot.apple.com',                    // Applebot (incl. Applebot-Extended - same crawler)
    '.duckduckgo.com',                        // DuckDuckBot / DuckAssistBot
    '.yandex.com', '.yandex.ru', '.yandex.net', // YandexBot
    '.baidu.com', '.baidu.jp',                 // Baiduspider
    '.sogou.com',                              // Sogou Spider
    '.crawl.amazonbot.amazon',                 // Amazonbot - officially documented at
    // developer.amazon.com/amazonbot

    // --- best-effort only: these vendors run mostly on rented cloud infra
    // (AWS/Azure/GCP), so PTR records are NOT guaranteed to follow a fixed
    // convention. Sourced from converging but non-authoritative third-party
    // observations, not an official vendor document. OpenAI additionally
    // gets the stronger ip-range check below (method 2). ---
    '.openai.com',                  // GPTBot / ChatGPT-User / OAI-SearchBot
    '.anthropic.com',               // ClaudeBot / Claude-User / Claude-SearchBot - Anthropic
    // does not currently publish stable IP ranges either
    '.facebook.com', '.fb.com'      // Meta-ExternalAgent / meta-webindexer / Meta-ExternalFetcher
    // (Meta AI). Meta does not publish IP ranges (per multiple
    // third-party sources) - dns is the only available signal
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


/* ------------------------------------------------------------------ */
/* Crawler verification, method 2: official published IP ranges         */
/*                                                                       */
/* The vendor-recommended method for OpenAI and Perplexity, who publish  */
/* their crawler IP ranges as JSON feeds instead of owning stable PTR    */
/* infrastructure. Uses Node's built-in net.BlockList (no extra          */
/* dependency) for CIDR containment checks.                             */
/*                                                                       */
/* CAVEAT (Perplexity): Cloudflare documented in 2025 that Perplexity    */
/* also runs undeclared crawlers outside these published ranges to      */
/* evade blocking. A NON-match here is therefore not proof of spoofing - */
/* it only means this method could not confirm it - such traffic is     */
/* simply treated as unverified, same as any other unrecognized bot.    */
/*                                                                       */
/* Lists are refreshed periodically but NOT persisted to disk (small,   */
/* cheap to re-fetch) - a fetch failure just keeps the previous list     */
/* (or leaves that source disabled until the next refresh if there never */
/* was one); it never blocks anything else. Vendor domains must be       */
/* reachable from the vps for this to populate (openai.com,             */
/* perplexity.com) - add them to any egress firewall allowlist.          */
/*                                                                       */
/* PERFORMANCE: both startup and the periodic refresh are fire-and-      */
/* forget (no await on initIpRangeCrawlerSources / refreshIpRangeSource  */
/* at startup) - server start and request handling are never blocked on  */
/* these network calls, even if openai.com/perplexity.com are            */
/* unreachable. The refresh timer is unref()'d so it cannot keep the     */
/* process alive either.                                                */
/* ------------------------------------------------------------------ */

const IP_RANGE_CRAWLER_SOURCES = [
    {
        name: 'openai', urls: [
            'https://openai.com/gptbot.json',
            'https://openai.com/chatgpt-user.json',
            'https://openai.com/searchbot.json'
        ]
    },
    {
        name: 'perplexity', urls: [
            'https://www.perplexity.com/perplexitybot.json',
            'https://www.perplexity.com/perplexity-user.json'
        ]
    }
]

const IP_RANGE_REFRESH_MS = 24 * 3600 * 1000
const IP_RANGE_FETCH_TIMEOUT_MS = 15000
const ipRangeBlockLists = new Map() // source name -> net.BlockList

// Defensive extraction: matches ip/cidr patterns directly in the raw
// response text regardless of the surrounding JSON structure, since
// vendors have been known to change the shape of these feeds without
// notice ("a moving control, not a permanent identity").
const IPV4_CIDR_RE = /\b(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?\b/g
const IPV6_CIDR_RE = /\b(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{0,4}(?:\/\d{1,3})?\b/g

const buildBlockListFromText = (text) => {
    const blockList = new net.BlockList()
    let count = 0
    const matches = [...(text.match(IPV4_CIDR_RE) || []), ...(text.match(IPV6_CIDR_RE) || [])]
    for (const raw of matches) {
        const isV6 = raw.includes(':')
        const [addr, prefix] = raw.split('/')
        try {
            blockList.addSubnet(addr, prefix ? parseInt(prefix) : (isV6 ? 128 : 32), isV6 ? 'ipv6' : 'ipv4')
            count++
        } catch (e) {
            // malformed match (e.g. a version number that happened to look
            // like an ip fragment) - skip it, not worth failing the whole feed
        }
    }
    return {blockList, count}
}

const refreshIpRangeSource = async (source) => {
    try {
        const texts = await Promise.all(source.urls.map(async (url) => {
            const abort = new AbortController()
            const timeout = setTimeout(() => abort.abort(), IP_RANGE_FETCH_TIMEOUT_MS)
            try {
                const res = await fetch(url, {signal: abort.signal, headers: {'User-Agent': 'lunuc-asn-blocker'}})
                if (!res.ok) {
                    throw new Error(`${url} -> HTTP ${res.status}`)
                }
                return await res.text()
            } finally {
                clearTimeout(timeout)
            }
        }))
        const {blockList, count} = buildBlockListFromText(texts.join('\n'))
        if (count === 0) {
            throw new Error('no valid ip/cidr entries parsed from response')
        }
        ipRangeBlockLists.set(source.name, blockList)
        console.log(`asnBlocker: crawler ip ranges updated for ${source.name} (${count} entries)`)
    } catch (e) {
        console.warn(`asnBlocker: could not refresh ${source.name} crawler ip ranges - ${e.message}`)
    }
}

const initIpRangeCrawlerSources = () => {
    for (const source of IP_RANGE_CRAWLER_SOURCES) {
        refreshIpRangeSource(source) // fire and forget at startup, fails soft
    }
    const timer = setInterval(() => {
        for (const source of IP_RANGE_CRAWLER_SOURCES) {
            refreshIpRangeSource(source)
        }
    }, IP_RANGE_REFRESH_MS)
    timer.unref()
}

const isIpInCrawlerRanges = (ip) => {
    const type = ip.includes(':') ? 'ipv6' : 'ipv4'
    for (const blockList of ipRangeBlockLists.values()) {
        try {
            if (blockList.check(ip, type)) {
                return true
            }
        } catch (e) {
            // malformed ip - ignore, treat as no match
        }
    }
    return false
}


/**
 * Combined crawler verification: official IP ranges first (cheap, no
 * network roundtrip), then DNS FCrDNS as fallback. Both outcomes are
 * cached, so repeat cost is paid once per ip per 6h.
 *
 * NOT called unconditionally on every request - see the PERFORMANCE note
 * in the module header. Only invoked once a policy has already flagged
 * the ip as listed.
 */
export const isVerifiedCrawler = async (ip) => {
    const cacheKey = 'asnCrawler-' + ip
    const cached = Cache.get(cacheKey)
    if (cached !== undefined && cached !== null) {
        return cached.verified
    }

    const verified = isIpInCrawlerRanges(ip) || await isDnsVerifiedCrawler(ip)
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
 * Also starts the periodic refresh timer for both mmdbs and the ai
 * crawler ip range sources - all fire-and-forget, see PERFORMANCE note
 * in the module header.
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

    initIpRangeCrawlerSources()
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
            entry = {label, requests: 0, blocked: 0, challenged: 0, listedHits: 0, ips: new Set(), paths: new Map(), agents: new Map()}
            stats.set(key, entry)
        }
        entry.requests++
        if (action !== 'allow') {
            // covers block / throttle-block / challenge - anything that
            // is not a plain pass-through counts here
            entry.blocked++
        }
        if (action === 'challenge') {
            // separate from 'blocked' above: challenge is a soft gate (visitor can
            // still get through by passing it), worth seeing distinctly from a
            // hard block/throttle
            entry.challenged++
        }
        if (isListed) {
            // counts hits regardless of mode: in log mode this is the dry
            // run ("how many requests WOULD the list catch"), in throttle/
            // challenge mode it additionally shows the allowed-through share
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
            challenged: e.challenged,
            listedHits: e.listedHits,
            distinctIps: e.ips.size,
            // exposes the actual ips (bounded to 200 already, see the cap
            // above) so a specific offender/exception (e.g. a third-party
            // service to add to hostrule.geoExceptIps) can be identified
            // directly from the stats endpoint without grepping logs
            ips: [...e.ips],
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

// hostrule-level ip exception, shared by both asn and country checks (see
// module header for the full rationale). Mirrors hostrule.blockedIps, but
// supports CIDR ranges in addition to plain IPs (e.g. SEMrush's crawler
// range "85.208.96.0/22" instead of pinning individual, rotating IPs).
//
// Cached per geoExceptIps ARRAY REFERENCE, not per hostrule object: hostrule
// itself is rebuilt on every request (see index.mjs), but as a shallow spread
// it keeps the same underlying geoExceptIps array from config across
// requests - so the WeakMap cache survives request-to-request and only
// rebuilds when the config actually reloads with a new array.
const geoExceptBlockListCache = new WeakMap() // geoExceptIps array -> net.BlockList

const buildExceptBlockList = (geoExceptIps) => {
    const blockList = new net.BlockList()
    for (const entry of geoExceptIps) {
        if (typeof entry !== 'string') {
            console.warn(`asnBlocker: invalid geoExceptIps entry (not a string) - skipping`)
            continue
        }
        const isV6 = entry.includes(':')
        const [addr, prefix] = entry.split('/')
        try {
            blockList.addSubnet(addr, prefix ? parseInt(prefix) : (isV6 ? 128 : 32), isV6 ? 'ipv6' : 'ipv4')
        } catch (e) {
            console.warn(`asnBlocker: invalid geoExceptIps entry "${entry}" - skipping`)
        }
    }
    return blockList
}

const isExceptedIp = (hostrule, ip) => {
    if (!hostrule.geoExceptIps || !hostrule.geoExceptIps.length) {
        return false
    }
    let blockList = geoExceptBlockListCache.get(hostrule.geoExceptIps)
    if (!blockList) {
        blockList = buildExceptBlockList(hostrule.geoExceptIps)
        geoExceptBlockListCache.set(hostrule.geoExceptIps, blockList)
    }
    try {
        return blockList.check(ip, ip.includes(':') ? 'ipv6' : 'ipv4')
    } catch (e) {
        // malformed ip - treat as not excepted, fail closed
        return false
    }
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
 * hostrule.geoExceptIps always overrides the listing decision (see module
 * header) - the request still flows through stats recording as a normal
 * 'allow'.
 *
 * @returns {Promise<{action:'allow'|'block'|'throttle-block', asn?:number, org?:string, isCrawler:boolean|null}>}
 *   isCrawler is null when no policy matched (verification was never run -
 *   see the PERFORMANCE note in the module header), otherwise true/false.
 */
export const checkAsnPolicy = async ({ip, urlPathname, userAgent, hostrule}) => {
    const policies = normalizePolicies(hostrule.asnPolicy)
    if (!mmdbLookups.asn || !policies.length || !ip) {
        return {action: 'allow', isCrawler: null}
    }

    const asnInfo = getAsn(ip)
    if (!asnInfo) {
        return {action: 'allow', isCrawler: null}
    }
    const {asn, org} = asnInfo

    const excepted = isExceptedIp(hostrule, ip)

    let matchedPolicy = null
    if (!excepted) {
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
    }

    let action = 'allow'
    let isCrawler = null // null = not evaluated - see PERFORMANCE note above.
    // Deliberately not run on every request: a dns
    // reverse lookup can take up to ~2s on first sight
    // of an ip, which must not land on ordinary traffic.
    if (matchedPolicy) {
        isCrawler = await isVerifiedCrawler(ip)
        if (!isCrawler) {
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

    asnStatsTracker.record({key: asn, label: org, ip, urlPathname: hostrule.host + urlPathname, userAgent, action, isListed: !!matchedPolicy})

    return {action, asn, org, isCrawler}
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
 * Modes: "log" | "throttle" | "block" | "challenge". "challenge" requires
 * cookieHeader (req.headers.cookie) to check for an existing confirmation
 * cookie - see server/util/botChallenge.mjs.
 *
 * hostrule.geoExceptIps always overrides the listing decision (see module
 * header) - the request still flows through stats recording as a normal
 * 'allow'.
 *
 * @returns {Promise<{action:'allow'|'block'|'throttle-block'|'challenge', country?:string, countryName?:string, isCrawler:boolean|null}>}
 *   isCrawler is null when no policy matched (verification was never run -
 *   see the PERFORMANCE note in the module header), otherwise true/false.
 */
export const checkCountryPolicy = async ({ip, urlPathname, userAgent, hostrule, cookieHeader}) => {
    const policies = normalizePolicies(hostrule.countryPolicy)
    if (!mmdbLookups.country || !policies.length || !ip) {
        return {action: 'allow', isCrawler: null}
    }

    const countryInfo = getCountry(ip)
    if (!countryInfo) {
        return {action: 'allow', isCrawler: null}
    }
    const {code, name} = countryInfo

    const excepted = isExceptedIp(hostrule, ip)

    let matchedPolicy = null
    if (!excepted) {
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
    }

    let action = 'allow'
    let isCrawler = null // null = not evaluated - see PERFORMANCE note above
    if (matchedPolicy) {
        isCrawler = await isVerifiedCrawler(ip)
        if (!isCrawler) {
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
            } else if (matchedPolicy.mode === 'challenge') {
                action = isChallengePassed(cookieHeader) ? 'allow' : 'challenge'
            }
        }
    }

    countryStatsTracker.record({key: code, label: name, ip, urlPathname, userAgent, action, isListed: !!matchedPolicy})

    return {action, country: code, countryName: name, isCrawler}
}


/* ------------------------------------------------------------------ */
/* Convenience wrapper                                                   */
/* ------------------------------------------------------------------ */

/**
 * Runs the ASN check first (near-zero cost if asnPolicy isn't configured
 * on the host), then the country check, and returns the first non-'allow'
 * result. Kept separate from checkAsnPolicy/checkCountryPolicy on purpose -
 * they stay independent, single-purpose functions with their own config
 * surface and their own stats tracker. This just gives the request
 * pipeline one call site instead of two.
 *
 * isCrawler: prefers whichever sub-check actually ran the verification
 * (matched a policy); stays null if neither did.
 *
 * @returns {Promise<{action, type?: 'asn'|'country', isCrawler: boolean|null, ...}>}
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
    return {action: 'allow', isCrawler: countryResult.isCrawler ?? asnResult.isCrawler ?? null}
}