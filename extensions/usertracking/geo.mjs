/**
 * Local ip lookups for the user tracking (api process).
 *
 * Reads the GeoLite2 mmdb files that server/util/asnBlocker.mjs downloads and refreshes
 * (server/geo/GeoLite2-ASN.mmdb, server/geo/GeoLite2-Country.mmdb, same env variables).
 * ASN and country are only opened read-only (the web server downloads them). The city db
 * (city, coordinates for system/visitors/location/map) is only needed here, so this module
 * downloads it itself in the background: server/geo/GeoLite2-City.mmdb, refreshed every 7 days.
 * Env: LUNUC_CITY_DB (path), LUNUC_CITY_DB_URL, LUNUC_CITY_DB_DOWNLOAD=false (no download, city lookup
 * only if the file exists). The city db needs about 60 MB RAM.
 *
 * No ip leaves the server. Lookups are in memory (microseconds) and only run in the
 * background flush of the tracking buffer, never in a request.
 */
import fs from 'fs'
import path from 'path'
import net from 'net'
import maxmind from 'maxmind'
import {pipeline} from 'stream/promises'
import {Readable} from 'stream'

const ROOT = path.resolve()
const DBS = {
    asn: process.env.LUNUC_ASN_DB || path.join(ROOT, 'server/geo/GeoLite2-ASN.mmdb'),
    country: process.env.LUNUC_COUNTRY_DB || path.join(ROOT, 'server/geo/GeoLite2-Country.mmdb'),
    city: process.env.LUNUC_CITY_DB || path.join(ROOT, 'server/geo/GeoLite2-City.mmdb')
}
const CITY_DOWNLOAD = process.env.LUNUC_CITY_DB_DOWNLOAD !== 'false'
const CITY_URL = process.env.LUNUC_CITY_DB_URL || 'https://github.com/P3TERX/GeoLite.mmdb/releases/latest/download/GeoLite2-City.mmdb'
const CITY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const CITY_MIN_SIZE = 10 * 1024 * 1024
let cityDownload = null

/* downloads the city db in the background (tmp file, probe lookup, atomic rename) */
const downloadCityDb = () => {
    if (cityDownload) return cityDownload
    cityDownload = (async () => {
        const file = DBS.city
        const tmpFile = `${file}.tmp-${process.pid}-${Date.now()}`
        try {
            await fs.promises.mkdir(path.dirname(file), {recursive: true})
            console.log(`usertracking geo: downloading city db from ${CITY_URL}`)
            const response = await fetch(CITY_URL, {signal: AbortSignal.timeout(5 * 60 * 1000), headers: {'User-Agent': 'lunuc-usertracking'}})
            if (!response.ok || !response.body) throw new Error(`unexpected response ${response.status}`)
            await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(tmpFile))
            const stat = await fs.promises.stat(tmpFile)
            if (stat.size < CITY_MIN_SIZE) throw new Error(`file too small (${stat.size} bytes)`)
            const reader = await maxmind.open(tmpFile)
            const probe = reader.get('8.8.8.8')
            if (!probe || !probe.location) throw new Error('probe lookup failed')
            await fs.promises.rename(tmpFile, file)
            // use the already loaded reader (no second read of 50 MB)
            readers.city = reader
            mtimes.city = (await fs.promises.stat(file)).mtimeMs
            console.log(`usertracking geo: city db updated (${(stat.size / 1048576).toFixed(1)} MB)`)
        } catch (e) {
            console.warn(`usertracking geo: city db download failed - ${e.message}`)
            fs.promises.unlink(tmpFile).catch(() => {})
        } finally {
            cityDownload = null
        }
    })()
    return cityDownload
}

const checkCityDownload = async () => {
    // with an own path (LUNUC_CITY_DB) the file is managed outside, unless LUNUC_CITY_DB_DOWNLOAD=true
    if (!CITY_DOWNLOAD || (process.env.LUNUC_CITY_DB && process.env.LUNUC_CITY_DB_DOWNLOAD !== 'true')) return
    try {
        const stat = await fs.promises.stat(DBS.city)
        if (Date.now() - stat.mtimeMs < CITY_MAX_AGE_MS) return
    } catch (e) {
        // missing
    }
    // not awaited: never holds up the flush
    downloadCityDb()
}
const RECHECK_MS = 6 * 60 * 60 * 1000
// a missing db (e.g. the web server is still downloading it at the first start) is checked again soon
const RECHECK_MISSING_MS = 5 * 60 * 1000

const readers = {asn: null, country: null, city: null}
const mtimes = {asn: 0, country: 0, city: 0}
let lastCheck = 0
let checking = null

const openIfChanged = async (key) => {
    const file = DBS[key]
    if (!file) return
    try {
        const stat = await fs.promises.stat(file)
        if (stat.isFile() && stat.mtimeMs !== mtimes[key]) {
            readers[key] = await maxmind.open(file)
            mtimes[key] = stat.mtimeMs
            console.log(`usertracking geo: loaded ${key} db ${file}`)
        }
    } catch (e) {
        if (readers[key] === null && mtimes[key] === 0) {
            // log only once
            mtimes[key] = -1
            console.log(`usertracking geo: no ${key} db (${file}) - ${key} lookup disabled`)
        }
    }
}

/** (re)opens the dbs if needed - cheap, call before a batch of lookups */
export const ensureGeo = async () => {
    const missing = !readers.asn || !readers.country || (!readers.city && DBS.city && CITY_DOWNLOAD)
    if (Date.now() - lastCheck < (missing ? RECHECK_MISSING_MS : RECHECK_MS)) return
    if (!checking) {
        checkCityDownload()
        checking = Promise.all(Object.keys(DBS).map(openIfChanged)).finally(() => {
            lastCheck = Date.now()
            checking = null
        })
    }
    return checking
}

export const hasGeo = () => !!(readers.asn || readers.country || readers.city)

const safeGet = (reader, ip) => {
    if (!reader || !ip) return null
    try {
        return reader.get(ip)
    } catch (e) {
        return null
    }
}

/**
 * @returns geodata in the shape of the former ip-api enhancement (country_code, country_name, org, ...)
 *          or null if no db is available
 */
export const lookupGeo = (ip) => {
    if (!hasGeo() || !net.isIP(ip)) return null
    const geo = {source: 'mmdb'}
    const asn = safeGet(readers.asn, ip)
    if (asn) {
        geo.asn = asn.autonomous_system_number
        geo.org = asn.autonomous_system_organization || ''
    }
    const city = safeGet(readers.city, ip)
    const country = city || safeGet(readers.country, ip)
    const c = country && (country.country || country.registered_country)
    if (c) {
        geo.country_code = c.iso_code
        geo.country_name = c.names ? (c.names.en || '') : ''
    }
    if (city) {
        if (city.city && city.city.names) geo.city = city.city.names.de || city.city.names.en || ''
        if (city.subdivisions && city.subdivisions[0]) {
            geo.region_code = city.subdivisions[0].iso_code
            geo.region_name = city.subdivisions[0].names ? city.subdivisions[0].names.en : ''
        }
        if (city.location) {
            geo.latitude = city.location.latitude
            geo.longitude = city.location.longitude
        }
        if (city.postal) geo.zip_code = city.postal.code
    }
    return geo
}

// networks of hosting / cloud providers. Akamai, Cloudflare and Fastly are NOT listed: iCloud Private Relay
// and Cloudflare WARP route real users through them.
// Humans rarely browse from there, so traffic from these
// networks is treated as bot (setting datacenterAsBot). Extend with the setting datacenterOrgs.
export const DATACENTER_REGEX = /amazon|aws|google llc|google cloud|microsoft|azure|hetzner|ovh|digitalocean|contabo|linode|alibaba|tencent|oracle|leaseweb|m247|choopa|vultr|scaleway|hostinger|ionos|datacamp|hostroyale|colocrossing|psychz|servers\.com|stark industries|bytedance|huawei cloud|netcup|hostwinds|ponynet|frantech|g-core|gcore|constant company|online s\.a\.s|kamatera|upcloud|hostkey|selectel|timeweb/i

export const isDatacenterOrg = (org, extra) => {
    if (!org) return false
    if (DATACENTER_REGEX.test(org)) return true
    if (Array.isArray(extra)) {
        const lower = org.toLowerCase()
        return extra.some(e => e && lower.indexOf(String(e).toLowerCase()) >= 0)
    }
    return false
}

/** 1.2.3.4 -> 1.2.3.0, 2001:db8:abcd:12::1 -> 2001:db8:abcd:: (48 bit) */
export const anonymizeIp = (ip) => {
    if (!ip) return ip
    if (net.isIPv4(ip)) {
        const parts = ip.split('.')
        parts[3] = '0'
        return parts.join('.')
    }
    if (net.isIPv6(ip)) {
        const [head, tail] = ip.split('::')
        const headParts = head ? head.split(':') : []
        const tailParts = tail !== undefined && tail ? tail.split(':') : []
        const missing = 8 - headParts.length - tailParts.length
        const full = tail !== undefined ? [...headParts, ...new Array(Math.max(missing, 0)).fill('0'), ...tailParts] : headParts
        return full.slice(0, 3).map(p => p.toLowerCase().replace(/^0+(?=.)/, '')).join(':') + '::'
    }
    return ip
}
