/**
 * User tracking (api process)
 *
 * Performance: a tracked request only does cheap synchronous work (read headers, one regex,
 * a counter in a Map, push into an in-memory buffer). Everything else - geo lookup, visitor id,
 * bot detection by network and rate, ip anonymization and the database write - happens in the
 * background flush of the buffer (every flushIntervalMs or when bufferSize is reached).
 *
 * Stored are the ip (full by default, anonymized with the setting anonymizeIp: last byte / 80 bit
 * removed), a visitor id (hash of ip + user agent with a salt that changes every day, used for
 * unique visitors) and the geodata from the local mmdb.
 *
 * Settings (KeyValue global 'UserTrackingSettings', reloaded every minute), defaults below.
 */
import {clientAddress, getHostFromHeaders} from '../../util/host.mjs'
import Util from '../../api/util/index.mjs'
import Hook from '../../util/hook.cjs'
import url from 'url'
import crypto from 'crypto'
import {pubsub} from '../../api/subscription.mjs'
import {DEFAULT_BOT_REGEX} from '../../util/userAgent.mjs'
import {
    TRACK_IS_BOT_HEADER,
    TRACK_REFERER_HEADER,
    TRACK_URL_HEADER,
    TRACK_USER_AGENT_HEADER
} from '../../api/constants/index.mjs'
import {isString, parseOrElse} from '../../client/util/json.mjs'
import {dynamicSettings} from '../../api/util/settings.mjs'
import {ObjectId} from 'mongodb'
import GenericResolver from '../../api/resolver/generic/genericResolver.mjs'
import {ensureGeo, lookupGeo, isDatacenterOrg, anonymizeIp} from './geo.mjs'

const DEFAULT_SETTINGS = {
    anonymizeIp: false,         // true: store 1.2.3.0 instead of 1.2.3.4
    visitorId: true,            // daily salted hash for unique visitors
    geo: true,                  // geodata from the local mmdb (server/geo)
    datacenterAsBot: true,      // traffic from hosting networks counts as bot
    datacenterOrgs: [],         // additional org names (substring, case insensitive)
    rateLimitPerMinute: 60,     // more requests per minute from one ip -> bot
    includeRequestHeader: false,
    flushIntervalMs: 60000,
    bufferSize: 1000,
    maxBuffer: 20000            // hard limit if the db is unreachable, newer entries are dropped
}
const USER_TRACKING_SETTINGS = {...DEFAULT_SETTINGS}

const BUFFER = {entries: [], db: null, flushing: false, dropped: 0, anonymousId: null}

// requests per ip in the current minute + ips that exceeded the limit (kept for 10 minutes)
const RATE = {counts: new Map(), offenders: new Map()}
const RATE_OFFENDER_MS = 10 * 60 * 1000
// upper bound of tracked ips per minute, protects the memory during a flood from many ips
const MAX_TRACKED_IPS = 200000

let SERVER_NAME = null
const serverName = () => SERVER_NAME || (SERVER_NAME = Util.systemProperties().hostname)

const SALT_COLLECTION = 'UserTrackingSalt'
export const BEACON_COLLECTION = 'UserTrackingBeacon'
// beacons per ip and minute, more are dropped (protection against spam)
const BEACON_LIMIT_PER_MINUTE = 120
const BEACON_COUNTS = new Map()
const SALTS = new Map()

Hook.on('appready', async ({context, db}) => {
    BUFFER.db = db
    await dynamicSettings({db, context, settings: USER_TRACKING_SETTINGS, key: 'UserTrackingSettings'})
    try {
        BUFFER.anonymousId = new ObjectId((await Util.anonymousUserContext(db)).id)
    } catch (e) {
        console.warn('usertracking: anonymous user not found', e.message)
    }
    ensureGeo()
    db.collection(BEACON_COLLECTION).createIndex({year: 1, month: 1, day: 1}).catch(e => console.warn('usertracking: beacon index', e.message))

    const flushTimer = setInterval(() => flushBuffer(), 5000)
    flushTimer.unref()

    const rateTimer = setInterval(() => {
        RATE.counts.clear()
        BEACON_COUNTS.clear()
        const now = Date.now()
        for (const [ip, time] of RATE.offenders) {
            if (now - time > RATE_OFFENDER_MS) RATE.offenders.delete(ip)
        }
    }, 60000)
    rateTimer.unref()
})

Hook.on('appexit', async () => {
    await flushBuffer(true)
})

// ------------------------------------------------------------------ request path (cheap)

/**
 * Queues one tracking entry. Synchronous apart from the returned promise - never awaits anything,
 * callers don't need to await it.
 * @param raw {ip, agent, host, path, referer, event, slug, data, isBotHeader, userId, headers}
 */
export const trackEvent = (raw) => {
    try {
        const {ip} = raw
        if (!ip) return
        const settings = USER_TRACKING_SETTINGS
        if (BUFFER.entries.length >= settings.maxBuffer) {
            BUFFER.dropped++
            return
        }

        const agent = raw.agent || ''
        let botReason = ''
        if (raw.isBotHeader === true) {
            botReason = 'header'
        } else if (DEFAULT_BOT_REGEX.test(agent)) {
            botReason = 'ua'
        }

        const count = (RATE.counts.get(ip) || 0) + 1
        if (count > 1 || RATE.counts.size < MAX_TRACKED_IPS) RATE.counts.set(ip, count)
        if (settings.rateLimitPerMinute > 0 && count > settings.rateLimitPerMinute) {
            RATE.offenders.set(ip, Date.now())
        }

        const date = new Date()
        const entry = {
            _id: new ObjectId(),
            ip,
            agent,
            isBot: !!botReason,
            botReason: botReason || undefined,
            referer: raw.referer || '',
            data: raw.data !== undefined ? parseOrElse(raw.data) : paramsFromPath(raw.path),
            event: raw.event,
            host: raw.host,
            server: serverName(),
            slug: raw.slug,
            path: raw.path ? String(raw.path).split('?')[0] : '',
            day: date.getDate(),
            month: date.getMonth() + 1,
            year: date.getFullYear(),
            createdBy: raw.userId ? new ObjectId(raw.userId) : null
        }
        if (settings.includeRequestHeader && raw.headers) {
            entry.headers = raw.headers
        }
        BUFFER.entries.push(entry)

        // live view and hooks only if somebody listens, outside of the request
        const ee = pubsub.ee
        const hasLiveListener = !ee || ee.listenerCount('subscribeUserTracking') > 0
        const hasHooks = Hook.hooks['tracking'] && Hook.hooks['tracking'].length > 0
        if (hasLiveListener || hasHooks) {
            setImmediate(() => {
                try {
                    if (hasLiveListener) {
                        pubsub.publish('subscribeUserTracking', {
                            userId: raw.userId,
                            subscribeUserTracking: {
                                action: 'create', data: [{
                                    ...entry,
                                    ip: settings.anonymizeIp ? anonymizeIp(entry.ip) : entry.ip,
                                    data: forceString(entry.data),
                                    headers: forceString(entry.headers)
                                }]
                            }
                        })
                    }
                    if (hasHooks) {
                        Hook.call('tracking', {insertData: {...entry}, db: BUFFER.db, context: raw.context})
                    }
                } catch (e) {
                    console.warn('usertracking: publish failed', e.message)
                }
            })
        }

        if (BUFFER.entries.length >= settings.bufferSize) {
            setImmediate(() => flushBuffer())
        }
    } catch (e) {
        // tracking must never break a request
        console.warn('usertracking: track failed', e.message)
    }
}

/**
 * page view beacon from the browser (extensions/usertracking/client.js), body is a small json string.
 * Only validated and queued here - vid, bot check and the write happen in the flush.
 */
export const trackBeacon = ({req, body}) => {
    try {
        const ip = clientAddress(req)
        if (!ip || !body || body.length > 4096) return
        const settings = USER_TRACKING_SETTINGS
        if (BUFFER.entries.length >= settings.maxBuffer) {
            BUFFER.dropped++
            return
        }
        const count = (BEACON_COUNTS.get(ip) || 0) + 1
        if (count > 1 || BEACON_COUNTS.size < MAX_TRACKED_IPS) BEACON_COUNTS.set(ip, count)
        if (count > BEACON_LIMIT_PER_MINUTE) return

        const b = JSON.parse(body)
        if (!b || typeof b !== 'object' || typeof b.pv !== 'string' || typeof b.p !== 'string' || b.p.charAt(0) !== '/') return
        const num = (v, max) => {
            v = Math.round(Number(v))
            return isFinite(v) && v >= 0 ? Math.min(v, max) : 0
        }
        const agent = req.headers['user-agent'] || ''
        const date = new Date()
        BUFFER.entries.push({
            _c: BEACON_COLLECTION,
            _id: new ObjectId(),
            ip,
            agent,
            isBot: DEFAULT_BOT_REGEX.test(agent),
            host: getHostFromHeaders(req.headers),
            pv: b.pv.substring(0, 40),
            path: b.p.split('?')[0].substring(0, 500),
            nav: b.n === 'spa' ? 'spa' : 'load',
            t: num(b.t, 2 * 60 * 60 * 1000),
            s: num(b.s, 100),
            w: num(b.w, 10000),
            lang: typeof b.l === 'string' ? b.l.substring(0, 2).toLowerCase() : '',
            day: date.getDate(),
            month: date.getMonth() + 1,
            year: date.getFullYear()
        })
    } catch (e) {
        // invalid json etc. - ignore
    }
}

/** tracks a request (cms page render, graphql mutation, 404) */
export const trackUser = ({req, event, slug, context, data, meta}) => {
    try {
        const ip = clientAddress(req)
        if (!ip || (!req.headers[TRACK_USER_AGENT_HEADER] && (ip === '::1' || ip === '127.0.0.1'))) {
            return
        }
        let referer = ''
        if (meta) {
            try {
                let metaJson = meta
                if (isString(meta) && (meta.startsWith('{') || meta.startsWith('['))) {
                    metaJson = JSON.parse(meta)
                }
                if (metaJson && metaJson.referer) {
                    referer = metaJson.referer
                }
            } catch (e) {
            }
        }
        trackEvent({
            ip,
            agent: req.headers[TRACK_USER_AGENT_HEADER] || req.headers['user-agent'] || '',
            host: getHostFromHeaders(req.headers),
            path: getPathFromHeader(req),
            referer: req.headers[TRACK_REFERER_HEADER] || referer || '',
            isBotHeader: req.headers[TRACK_IS_BOT_HEADER] === 'true' ? true : undefined,
            event,
            slug,
            data,
            userId: context && context.id,
            context,
            headers: req.headers
        })
    } catch (e) {
        console.warn('usertracking: trackUser failed', e.message)
    }
}

// url parameters that are kept when the page comes from the html cache (campaigns, internal search)
const KEEP_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid', 's', 'q', 'search', 'query', 'suche']

function paramsFromPath(path) {
    if (!path || typeof path !== 'string') return undefined
    const idx = path.indexOf('?')
    if (idx < 0) return undefined
    try {
        const params = new URLSearchParams(path.substring(idx + 1))
        let data
        for (const key of KEEP_PARAMS) {
            const value = params.get(key)
            if (value) {
                (data || (data = {}))[key] = value.substring(0, 200)
            }
        }
        return data
    } catch (e) {
        return undefined
    }
}

function forceString(data) {
    return data && data.constructor !== String ? JSON.stringify(data) : data
}

function getPathFromHeader(req) {
    if (req.headers[TRACK_URL_HEADER]) {
        return req.headers[TRACK_URL_HEADER]
    } else if (req.headers['referer']) {
        // is from graphql
        return url.parse(req.headers['referer'], true).pathname
    }
    return req.url
}

// ------------------------------------------------------------------ background flush

const pad = n => (n < 10 ? '0' : '') + n

const saltForDay = async (db, key) => {
    if (SALTS.has(key)) return SALTS.get(key)
    const coll = db.collection(SALT_COLLECTION)
    let doc = await coll.findOne({_id: key})
    if (!doc) {
        try {
            await coll.insertOne({_id: key, salt: crypto.randomBytes(32).toString('hex'), createdAt: new Date()})
        } catch (e) {
            // the other server was faster (duplicate key)
        }
        doc = await coll.findOne({_id: key})
        // salts of older days are deleted, so old visitor ids can't be recomputed
        const old = new Date()
        old.setDate(old.getDate() - 2)
        await coll.deleteMany({_id: {$lt: `${old.getFullYear()}-${pad(old.getMonth() + 1)}-${pad(old.getDate())}`}})
    }
    SALTS.set(key, doc.salt)
    for (const k of SALTS.keys()) {
        if (SALTS.size > 3 && k !== key) SALTS.delete(k)
    }
    return doc.salt
}

const enrich = async (db, entries) => {
    const settings = USER_TRACKING_SETTINGS
    if (settings.geo) {
        await ensureGeo()
    }
    // salts of the days in this batch (normally one), loaded once
    const salts = {}
    if (settings.visitorId) {
        for (const entry of entries) {
            const key = `${entry.year}-${pad(entry.month)}-${pad(entry.day)}`
            if (!salts[key]) salts[key] = await saltForDay(db, key)
        }
    }
    const visitorId = (entry, ip) => crypto.createHmac('sha256', salts[`${entry.year}-${pad(entry.month)}-${pad(entry.day)}`])
        .update(ip + '|' + entry.agent).digest('base64url').substring(0, 16)
    for (let i = 0; i < entries.length; i++) {
        // give the event loop room every 200 entries (big buffers after a db outage)
        if (i > 0 && i % 200 === 0) {
            await new Promise(resolve => setImmediate(resolve))
        }
        const entry = entries[i]
        const ip = entry.ip
        if (entry._c === BEACON_COLLECTION) {
            // beacons: only visitor id and bot flag, ip and user agent are not stored (they are in UserTracking)
            if (!entry.isBot && RATE.offenders.has(ip)) entry.isBot = true
            if (settings.visitorId) entry.vid = visitorId(entry, ip)
            delete entry.ip
            delete entry.agent
            continue
        }
        if (settings.geo) {
            const geo = lookupGeo(ip)
            if (geo) {
                entry.geodata = geo
                if (!entry.isBot && settings.datacenterAsBot && isDatacenterOrg(geo.org, settings.datacenterOrgs)) {
                    entry.isBot = true
                    entry.botReason = 'datacenter'
                }
            }
        }
        if (!entry.isBot && RATE.offenders.has(ip)) {
            entry.isBot = true
            entry.botReason = 'rate'
        }
        if (settings.visitorId) entry.vid = visitorId(entry, ip)
        if (settings.anonymizeIp) {
            entry.ip = anonymizeIp(ip)
        }
        if (!entry.createdBy) {
            entry.createdBy = BUFFER.anonymousId
        }
        // undefined would be stored as null
        for (const key of Object.keys(entry)) {
            if (entry[key] === undefined) delete entry[key]
        }
    }
}

const flushBuffer = async (force) => {
    const settings = USER_TRACKING_SETTINGS
    if (BUFFER.flushing) {
        // on exit: wait for the running flush, then write the rest
        if (force && BUFFER.flushPromise) {
            await BUFFER.flushPromise
            return flushBuffer(true)
        }
        return
    }
    if (!BUFFER.db || BUFFER.entries.length === 0) return
    const oldest = BUFFER.entries[0]._id.getTimestamp().getTime()
    if (!force && BUFFER.entries.length < settings.bufferSize && Date.now() - oldest < settings.flushIntervalMs) {
        return
    }
    BUFFER.flushing = true
    const entries = BUFFER.entries
    BUFFER.entries = []
    let done
    BUFFER.flushPromise = new Promise(resolve => done = resolve)
    try {
        await enrich(BUFFER.db, entries)
        const byCollection = {}
        for (const entry of entries) {
            const name = entry._c || 'UserTracking'
            delete entry._c
            ;(byCollection[name] || (byCollection[name] = [])).push(entry)
        }
        // each collection on its own, a failing beacon insert must not lose the page views
        let firstError = null
        for (const name of Object.keys(byCollection)) {
            try {
                await BUFFER.db.collection(name).insertMany(byCollection[name], {ordered: false})
            } catch (e) {
                firstError = firstError || e
            }
        }
        console.log(`usertracking: inserted ${Object.keys(byCollection).map(n => byCollection[n].length + ' ' + n).join(', ')}` + (BUFFER.dropped ? `, ${BUFFER.dropped} dropped (buffer full)` : ''))
        BUFFER.dropped = 0
        if (firstError) throw firstError
    } catch (error) {
        console.warn('usertracking: flush failed', error.message)
        try {
            await GenericResolver.createEntity(BUFFER.db, {context: {lang: 'en'}}, 'Log', {
                type: 'usertrackingFlush',
                message: error.message ? error.message + '\n\n' + error.stack : JSON.stringify(error),
                meta: {entries: entries.length, inserted: error.result ? error.result.insertedCount : undefined}
            })
        } catch (e) {
        }
    } finally {
        BUFFER.flushing = false
        BUFFER.flushPromise = null
        done()
    }
}
