/**
 * Daily rollup of the UserTracking collection for the visitor statistics (cms page system/visitors/v2).
 *
 * UserTracking holds one document per page view (millions). Counting it for every chart is slow,
 * so finished days are aggregated once into UserTrackingDaily:
 *
 *   one document per day and host   {_id: '2026-10-14|www.example.ch', date: '2026-10-14', host, views, ...}
 *   one document per day for all     {_id: '2026-10-14|*', host: '*', ...}
 *   UserTrackingDailyState           {_id: '2026-10-14', computedAt, final, hosts}  (marks a day as done)
 *
 * The current day is aggregated live and kept in memory for a few minutes.
 *
 * Used by:
 *   - cronjob "System: Visitor rollup" (dbscripts/cronjobs/System__Visitor_rollup) -> runRollupJob
 *   - api system/tracking/stats?mode=dashboard -> buildDashboard
 *
 * Definitions:
 *   views      page views of humans (event 'visit', isBot != true)
 *   botViews   all requests flagged as bot
 *   notFound   404 hits of humans
 *   uniq       distinct ips of humans on that day (a day sum is no exact unique count over a longer range)
 *
 * Top lists (pages, referrers, ...) are stored per day (top N) and merged for a range,
 * so they are exact per day and a close approximation over a range.
 */

import {ObjectId} from 'mongodb'

export const DAILY_COLLECTION = 'UserTrackingDaily'
export const STATE_COLLECTION = 'UserTrackingDailyState'
export const ALL_HOSTS = '*'

const TIMEZONE = 'Europe/Zurich'
// a day counts as final when it was computed at least this long after midnight of the next day
// (tracking buffer flush, geodata enhancement every 5 minutes)
const FINAL_AFTER_MS = 2 * 60 * 60 * 1000
const TODAY_CACHE_MS = 5 * 60 * 1000
const DASHBOARD_CACHE_MS = 10 * 60 * 1000

const TOP = {
    pages: 200,
    referrers: 40,
    countries: 30,
    orgs: 25,
    devices: 5,
    browsers: 12,
    os: 10,
    notFoundPaths: 30,
    botAgents: 20,
    botReasons: 6,
    entryPages: 30,
    exitPages: 30,
    screens: 5,
    langs: 15,
    campaigns: 30,
    searches: 30,
    ips: 20
}
const TOP_KEYS = Object.keys(TOP)

const NUMERIC_FIELDS = ['views', 'botViews', 'notFound', 'other', 'uniq', 'jsVisitors', 'jsViews', 'durSum', 'sessions', 'bounces']
const zeroNumeric = () => {
    const o = {}
    NUMERIC_FIELDS.forEach(f => o[f] = 0)
    return o
}
// top lists whose keys are paths (prefixed with the host in the summary over all hosts)
const PATH_KEYS = ['pages', 'notFoundPaths', 'entryPages', 'exitPages']
// visible time per page view: <10s, <30s, <1min, <3min, <10min, longer
const DURATION_LIMITS = [10000, 30000, 60000, 180000, 600000]
// time of one page view is capped for averages (tab left open)
const DURATION_CAP = 30 * 60 * 1000
const BEACON_COLLECTION = 'UserTrackingBeacon'

const pad = n => (n < 10 ? '0' : '') + n

export const dateKey = ({year, month, day}) => `${year}-${pad(month)}-${pad(day)}`

export const dayFromDate = (d) => ({year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate()})

const addDays = (day, n) => {
    const d = new Date(day.year, day.month - 1, day.day + n, 12)
    return dayFromDate(d)
}

const dayStart = (day) => new Date(day.year, day.month - 1, day.day, 0, 0, 0, 0)

/** list of days from (inclusive) to (inclusive), oldest first */
export const dayRange = (from, to) => {
    const result = []
    let current = from
    const toKey = dateKey(to)
    while (dateKey(current) <= toKey) {
        result.push(current)
        current = addDays(current, 1)
    }
    return result
}

/** www.example.ch -> [www.example.ch, example.ch] so both spellings are counted together */
export const hostVariants = (host) => {
    host = String(host || '').trim().toLowerCase().split(':')[0]
    if (!host) {
        return []
    }
    const bare = host.startsWith('www.') ? host.substring(4) : host
    return [...new Set([host, bare, 'www.' + bare])]
}

let indexesCreated = false
const ensureIndexes = async (db) => {
    if (indexesCreated) {
        return
    }
    indexesCreated = true
    try {
        await db.collection(DAILY_COLLECTION).createIndex({host: 1, date: 1})
        await db.collection(DAILY_COLLECTION).createIndex({date: 1})
        // covers the website list of the dashboard (no document has to be read)
        await db.collection(DAILY_COLLECTION).createIndex({date: 1, host: 1, views: 1, botViews: 1})
        await db.collection(BEACON_COLLECTION).createIndex({year: 1, month: 1, day: 1})
        await db.collection(ALERT_COLLECTION).createIndex({date: 1, host: 1})
        // alerts are removed after 180 days
        await db.collection(ALERT_COLLECTION).createIndex({createdAt: 1}, {expireAfterSeconds: 180 * 24 * 60 * 60})
    } catch (e) {
        console.warn('usertracking rollup: createIndex failed', e.message)
    }
}

// ---------------------------------------------------------------- aggregation of one day

const regexSwitch = (field, branches, fallback) => ({
    $switch: {
        branches: branches.map(([regex, value]) => ({
            case: {$regexMatch: {input: field, regex, options: 'i'}},
            then: value
        })),
        default: fallback
    }
})

const topPipeline = (keyField, limit, match) => [
    {$match: match},
    {$group: {_id: {h: '$h', k: keyField}, n: {$sum: 1}}},
    {$sort: {n: -1}},
    {$group: {_id: '$_id.h', top: {$push: {k: '$_id.k', n: '$n'}}}},
    {$project: {top: {$slice: ['$top', limit]}}}
]

const HUMAN = {b: false}
const HUMAN_VISIT = {b: false, e: 'visit'}

// expensive expressions (regex on the user agent) only for human page views - the lists only use those
const humanVisitOnly = (expr) => ({$cond: [{$and: [{$eq: ['$b', false]}, {$eq: ['$e', 'visit']}]}, expr, '']})

// value as string, '' if missing or no string
const str = (field) => ({$cond: [{$eq: [{$type: field}, 'string']}, field, '']})

const dayPipeline = (day) => [
    {$match: {year: day.year, month: day.month, day: day.day}},
    {
        $project: {
            _id: 0,
            h: {$toLower: {$ifNull: ['$host', '']}},
            b: {$eq: ['$isBot', true]},
            e: {$ifNull: ['$event', '']},
            ip: {$ifNull: ['$ip', '']},
            nt: {$cond: [{$ifNull: ['$vid', false]}, 1, 0]},
            // visitor id (daily salted hash) if available, else the (anonymized) ip
            v: {$ifNull: ['$vid', {$ifNull: ['$ip', '']}]},
            br2: {$ifNull: ['$botReason', 'ua']},
            p: {
                $cond: [
                    {$gt: [{$strLenCP: {$ifNull: ['$path', '']}}, 0]},
                    '$path',
                    {$concat: ['/', {$ifNull: ['$slug', '']}]}
                ]
            },
            a: {$ifNull: ['$agent', '']},
            r: {$ifNull: ['$referer', '']},
            c: {$ifNull: ['$geodata.country_code', '']},
            o: {$ifNull: ['$geodata.org', '']},
            hr: {$hour: {date: '$_id', timezone: TIMEZONE}},
            d: {$cond: [{$eq: [{$type: '$data'}, 'object']}, '$data', {}]}
        }
    },
    {
        $addFields: {
            // referrer host, only for human page views (the list only uses those)
            rh: humanVisitOnly({
                $toLower: {
                    $ifNull: [{
                        $let: {
                            vars: {m: {$regexFind: {input: {$toString: '$r'}, regex: /^https?:\/\/(?:www\.)?([^\/:?#]+)/i}}},
                            in: {$arrayElemAt: ['$$m.captures', 0]}
                        }
                    }, '']
                }
            }),
            // campaign: utm_source / utm_campaign, or the click id of google / meta ads
            cmp: humanVisitOnly({
                $switch: {
                    branches: [
                        {
                            case: {$gt: [{$strLenCP: str('$d.utm_source')}, 0]},
                            then: {$concat: [str('$d.utm_source'), {$cond: [{$gt: [{$strLenCP: str('$d.utm_campaign')}, 0]}, {$concat: [' / ', str('$d.utm_campaign')]}, '']}]}
                        },
                        {case: {$gt: [{$strLenCP: str('$d.gclid')}, 0]}, then: 'Google Ads'},
                        {case: {$gt: [{$strLenCP: str('$d.fbclid')}, 0]}, then: 'Facebook / Instagram'}
                    ],
                    default: ''
                }
            }),
            // internal search: common search parameters of the page
            sq: {$substrCP: [{$toLower: {$trim: {input: {$concat: [str('$d.s'), str('$d.q'), str('$d.search'), str('$d.query'), str('$d.suche')]}}}}, 0, 100]},
            dv: humanVisitOnly(regexSwitch('$a', [['iPad|Tablet|PlayBook|Silk', 'Tablet'], ['Mobi|iPhone|iPod|Android|Windows Phone', 'Mobile']], 'Desktop')),
            br: humanVisitOnly(regexSwitch('$a', [
                ['Edg/|Edge/', 'Edge'],
                ['OPR/|Opera', 'Opera'],
                ['SamsungBrowser', 'Samsung Internet'],
                ['Firefox/|FxiOS', 'Firefox'],
                ['Chrome/|CriOS|Chromium', 'Chrome'],
                ['Safari/', 'Safari']
            ], 'Andere')),
            os: humanVisitOnly(regexSwitch('$a', [
                ['iPhone|iPad|iPod', 'iOS'],
                ['Android', 'Android'],
                ['Windows', 'Windows'],
                ['Mac OS X|Macintosh', 'macOS'],
                ['CrOS', 'ChromeOS'],
                ['Linux', 'Linux']
            ], 'Andere'))
        }
    },
    {
        $facet: {
            totals: [{$group: {_id: {h: '$h', b: '$b', e: '$e'}, n: {$sum: 1}, nt: {$sum: '$nt'}}}],
            uniq: [
                {$match: HUMAN},
                {$group: {_id: {h: '$h', v: '$v'}}},
                {$group: {_id: '$_id.h', uniq: {$sum: 1}}}
            ],
            ips: topPipeline('$ip', TOP.ips, HUMAN),
            uniqAll: [{$match: HUMAN}, {$group: {_id: '$v'}}, {$count: 'n'}],
            botReasons: topPipeline('$br2', TOP.botReasons, {b: true}),
            pages: topPipeline('$p', TOP.pages, HUMAN_VISIT),
            referrers: topPipeline('$rh', TOP.referrers + 10, HUMAN_VISIT),
            countries: topPipeline('$c', TOP.countries, HUMAN),
            orgs: topPipeline('$o', TOP.orgs, HUMAN),
            devices: topPipeline('$dv', TOP.devices, HUMAN_VISIT),
            browsers: topPipeline('$br', TOP.browsers, HUMAN_VISIT),
            os: topPipeline('$os', TOP.os, HUMAN_VISIT),
            notFoundPaths: topPipeline('$p', TOP.notFoundPaths, {b: false, e: '404'}),
            botAgents: topPipeline('$a', TOP.botAgents, {b: true}),
            hours: [{$match: HUMAN_VISIT}, {$group: {_id: {h: '$h', hr: '$hr'}, n: {$sum: 1}}}],
            campaigns: topPipeline('$cmp', TOP.campaigns, {b: false, e: 'visit', cmp: {$ne: ''}}),
            searches: topPipeline('$sq', TOP.searches, {b: false, sq: {$ne: ''}})
        }
    }
]

const emptyHostDoc = (day, host) => {
    const date = dateKey(day)
    const doc = {
        _id: date + '|' + host, date, year: day.year, month: day.month, day: day.day, host,
        ...zeroNumeric(),
        hours: new Array(24).fill(0),
        durBuckets: new Array(DURATION_LIMITS.length + 1).fill(0),
        pageEngagement: []
    }
    TOP_KEYS.forEach(key => doc[key] = [])
    return doc
}

/** merges top lists [{k, n}] (sums n per key) and keeps the biggest */
export const mergeTops = (lists, limit, mapKey) => {
    const map = new Map()
    for (const list of lists) {
        if (!list) continue
        for (const item of list) {
            const key = mapKey ? mapKey(item) : item.k
            map.set(key, (map.get(key) || 0) + item.n)
        }
    }
    return [...map.entries()].map(([k, n]) => ({k, n})).sort((a, b) => b.n - a.n).slice(0, limit)
}

/** merges [{k, n, t, s}] (page views, sum of visible ms, sum of scroll %) */
export const mergeEngagement = (lists, limit, mapKey) => {
    const map = new Map()
    for (const list of lists) {
        if (!list) continue
        for (const item of list) {
            const key = mapKey ? mapKey(item) : item.k
            const e = map.get(key) || {k: key, n: 0, t: 0, s: 0}
            e.n += item.n
            e.t += item.t
            e.s += item.s
            map.set(key, e)
        }
    }
    return [...map.values()].sort((a, b) => b.n - a.n).slice(0, limit)
}

const stripWww = h => h.startsWith('www.') ? h.substring(4) : h

// ---------------------------------------------------------------- beacons (engagement, js executed)

const beaconSessions = (extra) => [
    {$sort: {id: 1}},
    {$group: {_id: {h: '$h', v: '$v'}, entry: {$first: '$p'}, exit: {$last: '$p'}, n: {$sum: 1}}},
    ...extra
]

const beaconPipeline = (day) => [
    {$match: {year: day.year, month: day.month, day: day.day, isBot: {$ne: true}}},
    // one row per page view (a page view can be sent several times, e.g. tab switch)
    {
        $group: {
            _id: '$pv',
            h: {$first: {$toLower: {$ifNull: ['$host', '']}}},
            v: {$first: {$ifNull: ['$vid', '$pv']}},
            p: {$first: '$path'},
            t: {$max: '$t'},
            s: {$max: '$s'},
            w: {$first: '$w'},
            l: {$first: '$lang'},
            id: {$min: '$_id'}
        }
    },
    {
        $facet: {
            pages: [
                {$group: {_id: {h: '$h', k: '$p'}, n: {$sum: 1}, t: {$sum: {$min: ['$t', DURATION_CAP]}}, s: {$sum: '$s'}}},
                {$sort: {n: -1}},
                {$group: {_id: '$_id.h', top: {$push: {k: '$_id.k', n: '$n', t: '$t', s: '$s'}}}},
                {$project: {top: {$slice: ['$top', TOP.pages]}}}
            ],
            totals: [{$group: {_id: '$h', n: {$sum: 1}, t: {$sum: {$min: ['$t', DURATION_CAP]}}}}],
            dur: [{
                $group: {
                    _id: {
                        h: '$h',
                        b: {
                            $switch: {
                                branches: DURATION_LIMITS.map((limit, i) => ({case: {$lt: ['$t', limit]}, then: i})),
                                default: DURATION_LIMITS.length
                            }
                        }
                    },
                    n: {$sum: 1}
                }
            }],
            visitors: [{$group: {_id: {h: '$h', v: '$v'}}}, {$group: {_id: '$_id.h', n: {$sum: 1}}}],
            visitorsAll: [{$group: {_id: '$v'}}, {$count: 'n'}],
            sessions: beaconSessions([{$group: {_id: '$_id.h', n: {$sum: 1}, bounces: {$sum: {$cond: [{$eq: ['$n', 1]}, 1, 0]}}}}]),
            entryPages: beaconSessions([
                {$group: {_id: {h: '$_id.h', k: '$entry'}, n: {$sum: 1}}}, {$sort: {n: -1}},
                {$group: {_id: '$_id.h', top: {$push: {k: '$_id.k', n: '$n'}}}}, {$project: {top: {$slice: ['$top', TOP.entryPages]}}}
            ]),
            exitPages: beaconSessions([
                {$group: {_id: {h: '$_id.h', k: '$exit'}, n: {$sum: 1}}}, {$sort: {n: -1}},
                {$group: {_id: '$_id.h', top: {$push: {k: '$_id.k', n: '$n'}}}}, {$project: {top: {$slice: ['$top', TOP.exitPages]}}}
            ]),
            screens: topPipeline({
                $switch: {
                    branches: [
                        {case: {$lte: [{$ifNull: ['$w', 0]}, 0]}, then: ''},
                        {case: {$lt: ['$w', 576]}, then: 'xs'},
                        {case: {$lt: ['$w', 992]}, then: 's'},
                        {case: {$lt: ['$w', 1440]}, then: 'm'}
                    ],
                    default: 'l'
                }
            }, TOP.screens, {}),
            langs: topPipeline({$ifNull: ['$l', '']}, TOP.langs, {})
        }
    }
]

const addBeaconData = async (db, day, docFor) => {
    const [result] = await db.collection(BEACON_COLLECTION).aggregate(beaconPipeline(day), {allowDiskUse: true}).toArray()
    if (!result) return 0
    for (const e of result.totals) {
        const doc = docFor(e._id)
        doc.jsViews = e.n
        doc.durSum = e.t
    }
    for (const e of result.visitors) docFor(e._id).jsVisitors = e.n
    for (const e of result.sessions) {
        const doc = docFor(e._id)
        doc.sessions = e.n
        doc.bounces = e.bounces
    }
    for (const e of result.dur) {
        const doc = docFor(e._id.h)
        if (e._id.b >= 0 && e._id.b < doc.durBuckets.length) doc.durBuckets[e._id.b] += e.n
    }
    for (const e of result.pages) docFor(e._id).pageEngagement = e.top
    for (const key of ['entryPages', 'exitPages', 'screens', 'langs']) {
        for (const e of result[key]) {
            docFor(e._id)[key] = e.top.map(item => ({k: item.k === null || item.k === undefined ? '' : String(item.k), n: item.n}))
        }
    }
    return result.visitorsAll[0] ? result.visitorsAll[0].n : 0
}

/**
 * aggregates one day of UserTracking
 * @returns [docs] one per host + one for ALL_HOSTS (nothing is stored)
 */
export const aggregateDay = async (db, day) => {
    const [result] = await db.collection('UserTracking').aggregate(dayPipeline(day), {allowDiskUse: true}).toArray()
    const byHost = {}
    const docFor = (h) => byHost[h] || (byHost[h] = emptyHostDoc(day, h || '(leer)'))

    for (const t of result.totals) {
        const doc = docFor(t._id.h)
        // tv 2: day with the new tracking (visitor id, bot detection by network and rate)
        if (t.nt > 0) doc.tv = 2
        if (t._id.b) {
            doc.botViews += t.n
        } else if (t._id.e === 'visit') {
            doc.views += t.n
        } else if (t._id.e === '404') {
            doc.notFound += t.n
        } else {
            doc.other += t.n
        }
    }
    for (const entry of result.uniq) {
        docFor(entry._id).uniq = entry.uniq
    }
    for (const key of ['ips', 'pages', 'countries', 'orgs', 'devices', 'browsers', 'os', 'notFoundPaths', 'botAgents', 'botReasons', 'campaigns', 'searches']) {
        for (const entry of result[key]) {
            docFor(entry._id)[key] = entry.top.map(item => ({k: item.k === null || item.k === undefined ? '' : String(item.k), n: item.n}))
        }
    }
    for (const entry of result.referrers) {
        const host = stripWww(entry._id || '')
        // only external referrers, empty = direct / unknown
        docFor(entry._id).referrers = entry.top
            .filter(item => item.k && stripWww(item.k) !== host)
            .slice(0, TOP.referrers)
    }
    for (const entry of result.hours) {
        const doc = docFor(entry._id.h)
        if (entry._id.hr >= 0 && entry._id.hr < 24) {
            doc.hours[entry._id.hr] += entry.n
        }
    }

    const jsVisitorsAll = await addBeaconData(db, day, docFor)

    const hostDocs = Object.values(byHost)

    // summary over all hosts
    const all = emptyHostDoc(day, ALL_HOSTS)
    for (const doc of hostDocs) {
        NUMERIC_FIELDS.forEach(f => all[f] += doc[f])
        doc.hours.forEach((n, i) => all.hours[i] += n)
        doc.durBuckets.forEach((n, i) => all.durBuckets[i] += n)
        if (doc.tv) all.tv = doc.tv
    }
    all.uniq = result.uniqAll[0] ? result.uniqAll[0].n : 0
    all.jsVisitors = jsVisitorsAll
    all.pageEngagement = mergeEngagement(hostDocs.map(doc => doc.pageEngagement.map(item => ({...item, k: doc.host + item.k}))), TOP.pages)
    for (const key of TOP_KEYS) {
        // paths are only meaningful with the host
        const withHost = PATH_KEYS.indexOf(key) >= 0
        all[key] = mergeTops(
            hostDocs.map(doc => withHost ? doc[key].map(item => ({k: doc.host + item.k, n: item.n})) : doc[key]),
            TOP[key]
        )
    }
    return [...hostDocs, all]
}

/** aggregates a finished day and stores it */
export const rollupDay = async (db, day) => {
    await ensureIndexes(db)
    const date = dateKey(day)
    const docs = await aggregateDay(db, day)
    const now = new Date()
    docs.forEach(doc => doc.computedAt = now)
    await db.collection(DAILY_COLLECTION).deleteMany({date})
    // hosts with only a few bot requests (scanners with random host headers) are only counted in the summary
    const toStore = docs.filter(doc => doc.host === ALL_HOSTS || doc.views > 0 || doc.notFound > 0 || doc.jsViews > 0 || doc.botViews >= 50)
    if (toStore.length > 1 || toStore[0].views || toStore[0].botViews) {
        await db.collection(DAILY_COLLECTION).insertMany(toStore, {ordered: false})
    }
    const final = now.getTime() >= dayStart(addDays(day, 1)).getTime() + FINAL_AFTER_MS
    await db.collection(STATE_COLLECTION).updateOne(
        {_id: date},
        {$set: {computedAt: now, final, hosts: docs.length - 1, views: docs[docs.length - 1].views}},
        {upsert: true}
    )
    return {date, hosts: docs.length - 1, final}
}

/**
 * makes sure the given past days are rolled up, computes at most max missing days
 * @returns number of days still missing
 */
export const ensureRollups = async (db, days, {max = 3, deadline, pauseMs = 0} = {}) => {
    const today = dateKey(dayFromDate(new Date()))
    const past = days.filter(day => dateKey(day) < today)
    if (past.length === 0) {
        return 0
    }
    const states = await db.collection(STATE_COLLECTION)
        .find({_id: {$in: past.map(dateKey)}}, {projection: {final: 1}}).toArray()
    const done = new Set(states.filter(s => s.final).map(s => s._id))
    const partial = new Set(states.filter(s => !s.final).map(s => s._id))
    // missing first, newest first, then the not final ones
    const todo = past.filter(day => !done.has(dateKey(day))).sort((a, b) => {
        const pa = partial.has(dateKey(a)) ? 1 : 0, pb = partial.has(dateKey(b)) ? 1 : 0
        return pa - pb || (dateKey(a) < dateKey(b) ? 1 : -1)
    })
    let computed = 0, missing = 0
    for (const day of todo) {
        const isPartial = partial.has(dateKey(day))
        // a partial (not final) day is only recomputed if it is old enough to become final now
        if (isPartial && Date.now() < dayStart(addDays(day, 1)).getTime() + FINAL_AFTER_MS) {
            continue
        }
        if (computed >= max || (deadline && Date.now() > deadline)) {
            if (!isPartial) {
                missing++
            }
            continue
        }
        await rollupDay(db, day)
        computed++
        if (pauseMs) {
            // give the database room for the website between two days
            await new Promise(resolve => setTimeout(resolve, pauseMs))
        }
    }
    return missing
}

// ---------------------------------------------------------------- cronjob

/**
 * Cronjob: recomputes the last days until they are final. The backfill of older days and the
 * deletion of old raw data only run in the night window, with pauses, so the website is not slowed down.
 *
 * @param nightHours     [from, to) local hours for the heavy work
 * @param retentionDays  0 = keep raw UserTracking forever, otherwise delete raw entries of days that
 *                       are older and already rolled up (final)
 * @returns summary
 */
export const runRollupJob = async (db, {
    maxDaysBack = 800,
    budgetMs = 4 * 60 * 1000,
    nightHours = [1, 6],
    pauseMs = 2000,
    retentionDays = 0,
    force = false,
    log = console.log,
    writeLog = null
} = {}) => {
    const started = Date.now()
    const deadline = started + budgetMs
    const today = dayFromDate(new Date())
    const hour = new Date().getHours()
    const isNight = force || (hour >= nightHours[0] && hour < nightHours[1])

    // daytime: only the last few days (cheap, normally nothing to do)
    let from = addDays(today, -3)
    if (isNight) {
        // oldest entry, so the backfill does not run through empty years
        const oldest = await db.collection('UserTracking').find({year: {$gt: 0}}, {projection: {year: 1, month: 1, day: 1}}).sort({_id: 1}).limit(1).toArray()
        from = addDays(today, -maxDaysBack)
        if (oldest[0] && dateKey(oldest[0]) > dateKey(from)) {
            // days before the first raw entry have no data: mark them as done without aggregating
            const emptyDays = dayRange(from, addDays({year: oldest[0].year, month: oldest[0].month, day: oldest[0].day}, -1)).map(dateKey)
            const existing = new Set((await db.collection(STATE_COLLECTION).find({_id: {$in: emptyDays}}, {projection: {_id: 1}}).toArray()).map(d => d._id))
            const missingEmpty = emptyDays.filter(d => !existing.has(d))
            if (missingEmpty.length) {
                const now = new Date()
                await db.collection(STATE_COLLECTION).bulkWrite(missingEmpty.map(d => ({
                    updateOne: {filter: {_id: d}, update: {$setOnInsert: {computedAt: now, final: true, hosts: 0, views: 0, empty: true}}, upsert: true}
                })), {ordered: false})
            }
            from = {year: oldest[0].year, month: oldest[0].month, day: oldest[0].day}
        }
    }
    const days = dayRange(from, addDays(today, -1))
    const missing = await ensureRollups(db, days, {max: 100000, deadline, pauseMs: isNight ? pauseMs : 0})

    // snapshot of today: the dashboard reads it from the db instead of aggregating today in a request
    try {
        await rollupDay(db, today)
    } catch (e) {
        log('rollup: snapshot of today failed - ' + e.message)
    }

    let deleted = 0
    if (isNight && retentionDays > 0 && missing === 0 && Date.now() < deadline) {
        deleted = await deleteOldRawData(db, {retentionDays, deadline, pauseMs, log})
    }

    let alerts = []
    try {
        alerts = await checkAlerts(db, {writeLog})
    } catch (e) {
        log('rollup: alert check failed - ' + e.message)
    }

    const summary = `rollup (${isNight ? 'night' : 'day'}): ${days.length} days checked (from ${dateKey(from)}), ${missing} still missing` +
        (deleted ? `, ${deleted} raw entries deleted` : '') + (alerts.length ? `, ${alerts.length} alerts` : '') +
        `, ${Math.round((Date.now() - started) / 1000)}s`
    log(summary)
    return {missing, days: days.length, deleted, alerts: alerts.length}
}

// ---------------------------------------------------------------- alerts

export const ALERT_COLLECTION = 'UserTrackingAlert'
// minimal average page views per day of a host, below that there are no alerts (too much noise)
const ALERT_MIN_VIEWS = 50
const ALERT_MAX_PER_DAY = 20
const ALERT_HOURS = [7, 23]

/**
 * Checks for anomalies and stores them in UserTrackingAlert (shown in the dashboard).
 * writeLog(alert) creates the Log entry (passed in by the cronjob, it has the GenericResolver).
 *
 *   tracking_stopped  no tracking entry in the last 60 minutes (7-23 h, max. once per 6 hours)
 *   traffic_drop      views of yesterday < 30% of the average of the 14 days before
 *   traffic_spike     views > 3x the average (and at least 500 more)
 *   notfound_spike    404 > 3x the average (and at least 30)
 *   bot_spike         bot share 25 percent points above the average (and at least 500 bot requests)
 */
export const checkAlerts = async (db, {writeLog, now = new Date()} = {}) => {
    const alerts = []
    const alertColl = db.collection(ALERT_COLLECTION)
    const today = dayFromDate(now)

    const hour = now.getHours()
    if (hour >= ALERT_HOURS[0] && hour < ALERT_HOURS[1]) {
        const since = ObjectId.createFromTime(Math.floor((now.getTime() - 60 * 60 * 1000) / 1000))
        const recent = await db.collection('UserTracking').find({_id: {$gt: since}}, {projection: {_id: 1}}).limit(1).toArray()
        // only if there is usually traffic at this hour (human page views yesterday, same hour)
        let usual = 0
        if (recent.length === 0) {
            const y = await db.collection(DAILY_COLLECTION).findOne({_id: dateKey(addDays(today, -1)) + '|' + ALL_HOSTS}, {projection: {hours: 1}})
            usual = y && y.hours ? (y.hours[hour] || 0) + (y.hours[hour - 1] || 0) : 0
        }
        if (recent.length === 0 && usual >= 20) {
            const dup = await alertColl.findOne({type: 'tracking_stopped', createdAt: {$gt: new Date(now.getTime() - 6 * 60 * 60 * 1000)}})
            if (!dup) {
                alerts.push({
                    type: 'tracking_stopped', host: ALL_HOSTS, date: dateKey(today),
                    message: 'Seit über 60 Minuten wurde kein einziger Seitenaufruf erfasst. Tracking oder Website prüfen.'
                })
            }
        }
    }

    // daily checks of yesterday, once it is final
    const yesterday = addDays(today, -1)
    const yKey = dateKey(yesterday)
    const state = await db.collection(STATE_COLLECTION).findOne({_id: yKey})
    if (state && state.final && !state.alertsChecked) {
        const fromKey = dateKey(addDays(yesterday, -14))
        const docs = await db.collection(DAILY_COLLECTION).find(
            {date: {$gte: fromKey, $lte: yKey}},
            {projection: {date: 1, host: 1, views: 1, botViews: 1, notFound: 1, tv: 1}}
        ).toArray()
        const byHost = {}
        docs.forEach(doc => (byHost[doc.host] || (byHost[doc.host] = [])).push(doc))
        const daily = []
        for (const host of Object.keys(byHost)) {
            const list = byHost[host]
            const y = list.find(d => d.date === yKey) || {views: 0, botViews: 0, notFound: 0}
            const before = list.filter(d => d.date !== yKey)
            // at least 7 days of history
            if (before.length < 7) continue
            const avg = f => before.reduce((s, d) => s + (d[f] || 0), 0) / 14
            const avgViews = avg('views')
            if (avgViews < ALERT_MIN_VIEWS) continue
            const share = d => (d.views + d.botViews) > 0 ? d.botViews / (d.views + d.botViews) : 0
            const avgShare = before.reduce((s, d) => s + share(d), 0) / before.length
            const label = host === ALL_HOSTS ? 'Alle Websites' : host
            const base = {host, date: yKey}
            // the new bot detection moves page views to bots: bot share and drop are only compared
            // with days of the same tracking version (no false alerts in the weeks after the switch)
            const sameVersion = before.filter(d => (d.tv || 1) === (y.tv || 1)).length >= 7
            if (sameVersion && y.views < avgViews * 0.3) {
                daily.push({...base, type: 'traffic_drop', value: y.views, baseline: Math.round(avgViews),
                    message: `${label}: nur ${y.views} Seitenaufrufe am ${yKey} (Durchschnitt ${Math.round(avgViews)}).`})
            } else if (y.views > avgViews * 3 && y.views - avgViews > 500) {
                daily.push({...base, type: 'traffic_spike', value: y.views, baseline: Math.round(avgViews),
                    message: `${label}: ${y.views} Seitenaufrufe am ${yKey}, ${Math.round(y.views / avgViews)}x mehr als üblich (${Math.round(avgViews)}). Unerkannte Bots?`})
            }
            const avgNotFound = avg('notFound')
            if (y.notFound > Math.max(30, avgNotFound * 3)) {
                daily.push({...base, type: 'notfound_spike', value: y.notFound, baseline: Math.round(avgNotFound),
                    message: `${label}: ${y.notFound} Fehlerseiten (404) am ${yKey} (Durchschnitt ${Math.round(avgNotFound)}). Kaputte Links?`})
            }
            if (sameVersion && share(y) > avgShare + 0.25 && y.botViews > 500) {
                daily.push({...base, type: 'bot_spike', value: Math.round(share(y) * 100), baseline: Math.round(avgShare * 100),
                    message: `${label}: Bot-Anteil ${Math.round(share(y) * 100)}% am ${yKey} (üblich ${Math.round(avgShare * 100)}%).`})
            }
        }
        // most important first: all hosts, then by host
        daily.sort((a, b) => (a.host === ALL_HOSTS ? -1 : 0) - (b.host === ALL_HOSTS ? -1 : 0))
        alerts.push(...daily.slice(0, ALERT_MAX_PER_DAY))
        await db.collection(STATE_COLLECTION).updateOne({_id: yKey}, {$set: {alertsChecked: true}})
    }

    if (alerts.length) {
        const createdAt = new Date()
        alerts.forEach(a => a.createdAt = createdAt)
        await alertColl.insertMany(alerts.map(a => ({...a})))
        if (writeLog) {
            for (const alert of alerts) {
                try {
                    await writeLog(alert)
                } catch (e) {
                    console.warn('visitor alert: log failed', e.message)
                }
            }
        }
    }
    return alerts
}

/** alerts for the dashboard */
const listAlerts = async (db, {hosts, fromKey}) => {
    try {
        return (await db.collection(ALERT_COLLECTION).find(
            {date: {$gte: fromKey}, host: {$in: [...hosts, ALL_HOSTS]}},
            {projection: {_id: 0, type: 1, host: 1, date: 1, message: 1}}
        ).sort({createdAt: -1}).limit(20).toArray())
    } catch (e) {
        return []
    }
}

/** deletes raw UserTracking entries older than retentionDays, only for days that are rolled up final */
const deleteOldRawData = async (db, {retentionDays, deadline, pauseMs, log}) => {
    const cutoffDay = addDays(dayFromDate(new Date()), -retentionDays)
    const cutoffId = ObjectId.createFromTime(Math.floor(dayStart(cutoffDay).getTime() / 1000))
    const coll = db.collection('UserTracking')

    // safety: every day before the cutoff that has raw data must be rolled up
    const oldest = await coll.find({_id: {$lt: cutoffId}}, {projection: {year: 1, month: 1, day: 1}}).sort({_id: 1}).limit(1).toArray()
    if (!oldest[0] || !oldest[0].year) return 0
    const daysToDelete = dayRange({year: oldest[0].year, month: oldest[0].month, day: oldest[0].day}, addDays(cutoffDay, -1)).map(dateKey)
    const finalCount = await db.collection(STATE_COLLECTION).countDocuments({_id: {$in: daysToDelete}, final: true})
    if (finalCount < daysToDelete.length) {
        log(`rollup: raw data not deleted, ${daysToDelete.length - finalCount} days before ${dateKey(cutoffDay)} are not rolled up yet`)
        return 0
    }

    let deleted = 0
    // beacons of the same days (small, one delete is enough)
    const beaconCutoff = {$or: [{year: {$lt: cutoffDay.year}}, {year: cutoffDay.year, month: {$lt: cutoffDay.month}}, {year: cutoffDay.year, month: cutoffDay.month, day: {$lt: cutoffDay.day}}]}
    deleted += (await db.collection(BEACON_COLLECTION).deleteMany(beaconCutoff)).deletedCount
    while (Date.now() < deadline) {
        // small chunks by _id, so the delete never holds the database for long
        const ids = (await coll.find({_id: {$lt: cutoffId}}, {projection: {_id: 1}}).sort({_id: 1}).limit(5000).toArray()).map(d => d._id)
        if (ids.length === 0) break
        const res = await coll.deleteMany({_id: {$in: ids}})
        deleted += res.deletedCount
        if (pauseMs) await new Promise(resolve => setTimeout(resolve, Math.min(pauseMs, 500)))
    }
    return deleted
}

// ---------------------------------------------------------------- dashboard

const todayCache = {key: null, time: 0, docs: null, promise: null}

const refreshToday = (db, today, key) => {
    if (todayCache.promise) return todayCache.promise
    todayCache.promise = aggregateDay(db, today).then(docs => {
        if (todayCache.key === key) {
            todayCache.docs = docs
            todayCache.time = Date.now()
        }
        return docs
    }).finally(() => {
        todayCache.promise = null
    })
    return todayCache.promise
}

/**
 * docs of today. Never waits for an aggregation if there is something to show:
 *   memory cache (refreshed in the background when older than TODAY_CACHE_MS)
 *   -> snapshot of the cronjob in the db (every 15 minutes)
 *   -> live aggregation (only if there is nothing else, e.g. before the first cronjob run)
 */
const todayDocs = async (db) => {
    const today = dayFromDate(new Date())
    const key = dateKey(today)
    if (todayCache.key !== key) {
        todayCache.key = key
        todayCache.docs = null
        todayCache.time = 0
    }
    if (todayCache.docs) {
        if (Date.now() - todayCache.time > TODAY_CACHE_MS) {
            refreshToday(db, today, key).catch(e => console.warn('usertracking today refresh', e.message))
        }
        return todayCache.docs
    }
    const stored = await db.collection(DAILY_COLLECTION).find({date: key}).toArray()
    if (stored.length) {
        todayCache.docs = stored
        todayCache.time = Math.min(...stored.map(d => d.computedAt ? new Date(d.computedAt).getTime() : 0))
        if (Date.now() - todayCache.time > TODAY_CACHE_MS) {
            refreshToday(db, today, key).catch(e => console.warn('usertracking today refresh', e.message))
        }
        return stored
    }
    return refreshToday(db, today, key)
}

const dashboardCache = new Map()

const sumDocs = (docs) => {
    const sum = zeroNumeric()
    docs.forEach(doc => NUMERIC_FIELDS.forEach(f => sum[f] += doc[f] || 0))
    return sum
}

/**
 * @param host  '' = all hosts, otherwise a host (www. and without are combined)
 * @param days  length of the range (ends today)
 * @param isAdmin  ips and host list are only returned for admins
 */
export const buildDashboard = async (db, {host = '', days = 30, isAdmin = false, refresh = false}) => {
    await ensureIndexes(db)
    days = Math.min(Math.max(parseInt(days) || 30, 1), 731)
    const hosts = host ? hostVariants(host) : [ALL_HOSTS]
    const today = dayFromDate(new Date())
    const todayKey = dateKey(today)
    const yesterday = addDays(today, -1)

    const rangeFrom = addDays(today, -(days - 1))
    const prevFrom = addDays(rangeFrom, -days)
    const monthFrom = {year: today.month === 12 ? today.year : today.year - 1, month: today.month === 12 ? 1 : today.month + 1, day: 1}
    const loadFrom = dateKey(prevFrom) < dateKey(monthFrom) ? prevFrom : monthFrom

    const cacheKey = [hosts.join(','), days, todayKey, isAdmin].join('|')

    const loadPast = async () => {
        const coll = db.collection(DAILY_COLLECTION)
        const hostMatch = hosts.length === 1 ? hosts[0] : {$in: hosts}
        const rangeKeys = dayRange(rangeFrom, yesterday).map(dateKey)

        // the lists are merged to the top 30 of the range: longer ranges need fewer entries per day
        const listLimit = days > 31 ? 40 : 100
        const topProjection = {date: 1, hours: 1, durBuckets: 1, pageEngagement: {$slice: listLimit}}
        TOP_KEYS.forEach(k => {
            if (k === 'ips' && !isAdmin) return
            topProjection[k] = TOP[k] > 30 ? {$slice: k === 'pages' ? listLimit : 30} : 1
        })

        // all queries in parallel
        const [doneDays, numericDocs, topDocs, hostList] = await Promise.all([
            // missing days are only counted here, the cronjob computes them (no aggregation in a request)
            rangeKeys.length ? db.collection(STATE_COLLECTION).countDocuments({_id: {$in: rangeKeys}}) : 0,
            coll.find(
                {host: hostMatch, date: {$gte: dateKey(loadFrom), $lte: dateKey(yesterday)}},
                {projection: NUMERIC_FIELDS.reduce((p, f) => (p[f] = 1, p), {date: 1})}
            ).toArray(),
            days > 1 ? coll.find(
                {host: hostMatch, date: {$gte: dateKey(rangeFrom), $lte: dateKey(yesterday)}},
                {projection: topProjection}
            ).toArray() : [],
            isAdmin ? coll.aggregate([
                {$match: {date: {$gte: dateKey(rangeFrom), $lte: dateKey(yesterday)}, host: {$ne: ALL_HOSTS}}},
                // only fields of the index {date, host, views, botViews}: no document is read
                {$project: {_id: 0, host: 1, views: 1, botViews: 1}},
                {$group: {_id: '$host', views: {$sum: '$views'}, botViews: {$sum: '$botViews'}}},
                {$match: {views: {$gt: 0}}},
                {$sort: {views: -1}},
                {$limit: 200}
            ]).toArray().then(list => list.map(h => ({host: h._id, views: h.views, botViews: h.botViews}))) : null
        ])
        const pending = rangeKeys.length - doneDays
        const result = {time: Date.now(), numericDocs, topDocs, hostList, pending}
        dashboardCache.set(cacheKey, result)
        // keep the cache small
        if (dashboardCache.size > 100) {
            dashboardCache.delete(dashboardCache.keys().next().value)
        }
        return result
    }

    // stale-while-revalidate: an older result is shown at once and refreshed in the background
    let past = !refresh && dashboardCache.get(cacheKey)
    if (!past) {
        past = await loadPast()
    } else if (Date.now() - past.time > DASHBOARD_CACHE_MS && !past.refreshing) {
        past.refreshing = true
        loadPast().catch(e => {
            past.refreshing = false
            console.warn('usertracking dashboard refresh', e.message)
        })
    }

    // today live (all hosts are aggregated at once and cached)
    const liveDocs = (await todayDocs(db)).filter(doc => hosts.indexOf(doc.host) >= 0)

    // ---- per day
    const byDate = {}
    past.numericDocs.forEach(doc => (byDate[doc.date] || (byDate[doc.date] = [])).push(doc))
    byDate[todayKey] = liveDocs

    const daySums = (from, to) => dayRange(from, to).map(day => {
        const date = dateKey(day)
        return {date, ...sumDocs(byDate[date] || [])}
    })

    const series = daySums(rangeFrom, today)
    const prevSeries = daySums(prevFrom, addDays(rangeFrom, -1))
    const alerts = await listAlerts(db, {hosts: hosts.flatMap(h => [h]), fromKey: dateKey(rangeFrom)})

    const monthly = []
    for (let i = 11; i >= 0; i--) {
        const d = new Date(today.year, today.month - 1 - i, 1, 12)
        const ym = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
        const docs = Object.keys(byDate).filter(date => date.startsWith(ym)).flatMap(date => byDate[date])
        monthly.push({month: ym, ...sumDocs(docs)})
    }

    // ---- top lists over the range
    const rangeTopDocs = [...past.topDocs, ...liveDocs]
    const top = {}
    TOP_KEYS.forEach(key => {
        if (key === 'ips' && !isAdmin) return
        const isPath = PATH_KEYS.indexOf(key) >= 0
        top[key] = mergeTops(rangeTopDocs.map(doc => doc[key]), isPath ? 30 : 20,
            // www and non www of the same page are one entry
            isPath && !host ? item => item.k.replace(/^www\./, '') : undefined)
    })
    top.pageEngagement = mergeEngagement(rangeTopDocs.map(doc => doc.pageEngagement), 30,
        !host ? item => item.k.replace(/^www\./, '') : undefined)

    const durBuckets = new Array(DURATION_LIMITS.length + 1).fill(0)
    rangeTopDocs.forEach(doc => (doc.durBuckets || []).forEach((n, i) => durBuckets[i] += n))

    const hours = new Array(24).fill(0)
    rangeTopDocs.forEach(doc => (doc.hours || []).forEach((n, i) => hours[i] += n))

    // monday first
    const weekdays = new Array(7).fill(0)
    series.forEach(s => {
        const [y, m, d] = s.date.split('-').map(Number)
        weekdays[(new Date(y, m - 1, d, 12).getDay() + 6) % 7] += s.views
    })

    const sum = arr => arr.reduce((acc, s) => {
        NUMERIC_FIELDS.forEach(f => acc[f] += s[f])
        return acc
    }, zeroNumeric())

    return {
        host,
        days,
        from: dateKey(rangeFrom),
        to: todayKey,
        isAdmin,
        hosts: past.hostList,
        totals: sum(series),
        prevTotals: sum(prevSeries),
        prevHasData: prevSeries.some(s => s.views > 0 || s.botViews > 0),
        series,
        // previous period per day (same length, for the comparison line)
        prevSeries: prevSeries.map(d => ({date: d.date, views: d.views, botViews: d.botViews, uniq: d.uniq})),
        alerts,
        monthly,
        top,
        hours,
        weekdays,
        durBuckets,
        pending: past.pending,
        generatedAt: new Date().toISOString(),
        cachedAt: new Date(past.time).toISOString(),
        todayAt: todayCache.time ? new Date(todayCache.time).toISOString() : null
    }
}

// ---------------------------------------------------------------- drilldown of one page

/**
 * views and engagement of one page per day
 * @param path  '/path' with a host, 'host/path' (without www) for all hosts
 */
export const buildPageTrend = async (db, {host = '', days = 30, path}) => {
    days = Math.min(Math.max(parseInt(days) || 30, 1), 731)
    const hosts = host ? hostVariants(host) : [ALL_HOSTS]
    const today = dayFromDate(new Date())
    const rangeFrom = addDays(today, -(days - 1))
    const yesterday = addDays(today, -1)
    const norm = k => host ? k : String(k).replace(/^www\./, '')
    const target = norm(path)

    const docs = await db.collection(DAILY_COLLECTION).find(
        {host: hosts.length === 1 ? hosts[0] : {$in: hosts}, date: {$gte: dateKey(rangeFrom), $lte: dateKey(yesterday)}},
        {projection: {date: 1, pages: 1, pageEngagement: 1, entryPages: 1, exitPages: 1}}
    ).toArray()
    const live = (await todayDocs(db)).filter(doc => hosts.indexOf(doc.host) >= 0)
    const byDate = {}
    ;[...docs, ...live].forEach(doc => (byDate[doc.date] || (byDate[doc.date] = [])).push(doc))

    const find = (list, f) => (list || []).filter(item => norm(item.k) === target).reduce((s, item) => s + (item[f] || 0), 0)
    const series = dayRange(rangeFrom, today).map(day => {
        const date = dateKey(day)
        const list = byDate[date] || []
        const views = list.reduce((s, doc) => s + find(doc.pages, 'n'), 0)
        const jsViews = list.reduce((s, doc) => s + find(doc.pageEngagement, 'n'), 0)
        const t = list.reduce((s, doc) => s + find(doc.pageEngagement, 't'), 0)
        const sc = list.reduce((s, doc) => s + find(doc.pageEngagement, 's'), 0)
        return {
            date, views,
            avgTime: jsViews ? Math.round(t / jsViews) : null,
            avgScroll: jsViews ? Math.round(sc / jsViews) : null,
            entries: list.reduce((s, doc) => s + find(doc.entryPages, 'n'), 0),
            exits: list.reduce((s, doc) => s + find(doc.exitPages, 'n'), 0)
        }
    })
    return {path: target, host, days, series}
}
