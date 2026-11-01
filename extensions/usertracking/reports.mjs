/**
 * Reports on the raw tracking data for a short time range (api system/tracking/stats):
 *   mode=locations  visitors on the map (system/visitors/location/map), grouped by coordinates
 *   mode=sessions   visits (system/visitors/duration), grouped by visitor id
 *
 * Both run in mongodb and only return the result (instead of up to 100'000 single documents
 * to the browser as before). The range is limited and the results are cached for a few minutes.
 */
import {ObjectId} from 'mongodb'
import {hostVariants} from './rollup.mjs'

const MAX_RANGE_MS = 31 * 24 * 60 * 60 * 1000
const CACHE_MS = 3 * 60 * 1000
const BEACON_COLLECTION = 'UserTrackingBeacon'

const cache = new Map()
const cached = async (key, fn) => {
    const hit = cache.get(key)
    if (hit && Date.now() - hit.time < CACHE_MS) return hit.data
    const data = await fn()
    cache.set(key, {time: Date.now(), data})
    if (cache.size > 50) cache.delete(cache.keys().next().value)
    return data
}

const parseRange = (from, to) => {
    let toDate = to ? new Date(to) : new Date()
    if (isNaN(toDate.getTime())) toDate = new Date()
    let fromDate = from ? new Date(from) : new Date(toDate.getTime() - 24 * 60 * 60 * 1000)
    if (isNaN(fromDate.getTime()) || fromDate >= toDate) fromDate = new Date(toDate.getTime() - 24 * 60 * 60 * 1000)
    if (toDate - fromDate > MAX_RANGE_MS) fromDate = new Date(toDate.getTime() - MAX_RANGE_MS)
    return {fromDate, toDate}
}

const baseMatch = ({host, fromDate, toDate, includeBots}) => {
    const match = {
        _id: {
            $gt: ObjectId.createFromTime(Math.floor(fromDate.getTime() / 1000)),
            $lt: ObjectId.createFromTime(Math.floor(toDate.getTime() / 1000))
        }
    }
    if (host) match.host = {$in: hostVariants(host)}
    if (!includeBots) match.isBot = {$ne: true}
    return match
}

/** points on the map, coordinates rounded to ~1 km */
export const locations = async (db, {host = '', from, to, includeBots = false, isAdmin = false}) => {
    const {fromDate, toDate} = parseRange(from, to)
    const key = ['loc', host, fromDate.getTime(), toDate.getTime(), includeBots, isAdmin].join('|')
    return cached(key, async () => {
        const match = {...baseMatch({host, fromDate, toDate, includeBots}), 'geodata.latitude': {$type: 'number'}}
        const group = {
            _id: {lat: {$round: ['$geodata.latitude', 2]}, lng: {$round: ['$geodata.longitude', 2]}},
            n: {$sum: 1},
            city: {$first: '$geodata.city'},
            country: {$first: '$geodata.country_name'}
        }
        if (isAdmin) group.ips = {$addToSet: '$ip'}
        const points = await db.collection('UserTracking').aggregate([
            {$match: match},
            {$project: {_id: 0, ip: 1, 'geodata.latitude': 1, 'geodata.longitude': 1, 'geodata.city': 1, 'geodata.country_name': 1}},
            {$group: group},
            {$sort: {n: -1}},
            {$limit: 5000},
            {
                $project: {
                    _id: 0, lat: '$_id.lat', lng: '$_id.lng', n: 1, city: 1, country: 1,
                    ...(isAdmin ? {ips: {$slice: ['$ips', 5]}, ipCount: {$size: '$ips'}} : {})
                }
            }
        ], {allowDiskUse: true}).toArray()
        return {from: fromDate.toISOString(), to: toDate.toISOString(), points}
    })
}

/** visits: one row per visitor (vid, or ip for older entries), newest first */
export const sessions = async (db, {host = '', from, to, includeBots = false, isAdmin = false, limit = 500}) => {
    const {fromDate, toDate} = parseRange(from, to)
    limit = Math.min(Math.max(parseInt(limit) || 500, 1), 2000)
    const key = ['ses', host, fromDate.getTime(), toDate.getTime(), includeBots, isAdmin, limit].join('|')
    return cached(key, async () => {
        const match = baseMatch({host, fromDate, toDate, includeBots})
        const rows = await db.collection('UserTracking').aggregate([
            {$match: match},
            // sort directly after the match, so mongodb can use the _id index (no in-memory sort)
            {$sort: {_id: 1}},
            {
                $project: {
                    v: {$ifNull: ['$vid', '$ip']}, ip: 1, host: 1, path: 1, slug: 1, referer: 1, isBot: 1, botReason: 1,
                    'geodata.country_name': 1, 'geodata.city': 1, 'geodata.zip_code': 1, event: 1
                }
            },
            {
                $group: {
                    _id: '$v',
                    first: {$first: '$_id'},
                    last: {$last: '$_id'},
                    count: {$sum: 1},
                    ip: {$first: '$ip'},
                    host: {$first: '$host'},
                    entry: {$first: {$ifNull: ['$path', {$concat: ['/', {$ifNull: ['$slug', '']}]}]}},
                    exit: {$last: {$ifNull: ['$path', {$concat: ['/', {$ifNull: ['$slug', '']}]}]}},
                    referer: {$first: '$referer'},
                    isBot: {$max: '$isBot'},
                    botReason: {$first: '$botReason'},
                    geodata: {$first: '$geodata'},
                    notFound: {$sum: {$cond: [{$eq: ['$event', '404']}, 1, 0]}}
                }
            },
            {$sort: {last: -1}},
            {$limit: limit}
        ], {allowDiskUse: true}).toArray()

        // visible time from the browser beacon (only visitors with a visitor id)
        const vids = rows.map(r => r._id).filter(v => typeof v === 'string' && v.indexOf('.') < 0 && v.indexOf(':') < 0)
        const visible = {}
        if (vids.length) {
            const beacons = await db.collection(BEACON_COLLECTION).aggregate([
                {$match: {_id: match._id, vid: {$in: vids}}},
                {$group: {_id: '$pv', v: {$first: '$vid'}, t: {$max: '$t'}}},
                {$group: {_id: '$v', t: {$sum: '$t'}, pages: {$sum: 1}}}
            ]).toArray()
            beacons.forEach(b => visible[b._id] = {t: b.t, pages: b.pages})
        }

        return {
            from: fromDate.toISOString(),
            to: toDate.toISOString(),
            limit,
            rows: rows.map(r => ({
                start: r.first.getTimestamp().toISOString(),
                end: r.last.getTimestamp().toISOString(),
                count: r.count,
                notFound: r.notFound,
                ip: isAdmin ? r.ip : undefined,
                host: r.host,
                entry: r.entry,
                exit: r.exit,
                referer: r.referer || '',
                isBot: !!r.isBot,
                botReason: r.botReason,
                country: r.geodata ? r.geodata.country_name : '',
                city: r.geodata ? r.geodata.city : '',
                zip: r.geodata ? r.geodata.zip_code : '',
                visibleMs: visible[r._id] ? visible[r._id].t : null
            }))
        }
    })
}
