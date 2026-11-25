/**
 * Statistics of one cms page in the cms editor (query userTrackingPageStats).
 *   summary  views per day and against the previous period (toolbar button, loaded with the editor)
 *   detail   additionally time on page, scroll depth, entries / exits, last visit (only when the tab is open)
 *
 * Only the daily rollup (UserTrackingDaily) is read, filtered to the paths of the page inside mongodb,
 * the raw data (UserTracking) is only touched for the last visit if this process has not seen it,
 * limited to the last 24 hours. Results are cached for a short time.
 */
import {ObjectId} from 'mongodb'
import config from '../../gensrc/config.mjs'
import {buildPageTrend} from './rollup.mjs'
import {getLastVisit} from './track.mjs'

const CACHE_MS = 2 * 60 * 1000
const MAX_CACHE = 300
const LAST_VISIT_WINDOW_MS = 24 * 60 * 60 * 1000
const ALLOWED_DAYS = [7, 30, 90, 365]

const cache = new Map()
const pending = new Map()

/** paths under which the page is tracked: /slug and /<lang>/slug */
export const pagePaths = (slug) => {
    const s = String(slug || '').replace(/^\/+|\/+$/g, '')
    const paths = new Set()
    const add = (p) => {
        paths.add(p)
        if (p.length > 1) paths.add(p + '/')
    }
    add(s ? '/' + s : '/')
    for (const lang of (config.LANGUAGES || [])) {
        add('/' + lang + (s ? '/' + s : ''))
    }
    return [...paths]
}

const sumPeriod = (list) => {
    let views = 0, jsViews = 0, time = 0, scroll = 0, entries = 0, exits = 0
    for (const d of list) {
        views += d.views
        entries += d.entries
        exits += d.exits
        if (d.jsViews) {
            jsViews += d.jsViews
            time += (d.avgTime || 0) * d.jsViews
            scroll += (d.avgScroll || 0) * d.jsViews
        }
    }
    return {
        views, entries, exits,
        avgTime: jsViews ? Math.round(time / jsViews) : null,
        avgScroll: jsViews ? Math.round(scroll / jsViews) : null
    }
}

/** last human view in the raw data, only the last 24 hours (range on the _id index) */
const lastVisitFromDb = async (db, slug) => {
    try {
        const since = ObjectId.createFromTime(Math.floor((Date.now() - LAST_VISIT_WINDOW_MS) / 1000))
        const doc = await db.collection('UserTracking')
            .find({_id: {$gt: since}, slug, isBot: {$ne: true}}, {projection: {_id: 1}})
            .sort({_id: -1})
            .hint({_id: 1})
            .limit(1)
            .maxTimeMS(500)
            .next()
        return doc ? doc._id.getTimestamp().getTime() : 0
    } catch (e) {
        // timeout on a very large collection: no last visit instead of a slow editor
        return 0
    }
}

const compute = async (db, {host, slug, days, detail}) => {
    const {series} = await buildPageTrend(db, {
        host, days: days * 2, path: pagePaths(slug),
        fields: detail ? undefined : ['pages'],
        // today from the snapshot of the cronjob: never starts an aggregation of the raw data
        liveToday: false
    })
    const current = series.slice(-days)
    const previous = series.slice(0, series.length - days)

    if (!detail) {
        let views = 0, previousViews = 0
        current.forEach(d => views += d.views)
        previous.forEach(d => previousViews += d.views)
        return {
            slug, host, days, detail: false,
            current: {views},
            previous: {views: previousViews},
            series: current.map(d => ({date: d.date, views: d.views})),
            computedAt: Date.now()
        }
    }

    let lastVisit = getLastVisit(slug)
    // the raw data is only searched if the page had views yesterday or today
    // (otherwise the search would run through the whole 24 hours without a hit)
    if (!lastVisit && current.slice(-2).some(d => d.views > 0)) {
        lastVisit = await lastVisitFromDb(db, slug)
    }
    let lastActiveDate = null
    for (let i = current.length - 1; i >= 0; i--) {
        if (current[i].views > 0) {
            lastActiveDate = current[i].date
            break
        }
    }

    return {
        slug, host, days, detail: true,
        current: sumPeriod(current),
        previous: sumPeriod(previous),
        series: current.map(d => ({date: d.date, views: d.views})),
        previousSeries: previous.map(d => d.views),
        lastVisit: lastVisit || null,
        lastActiveDate,
        computedAt: Date.now()
    }
}

export const pageStats = async (db, {host = '', slug = '', days = 30, detail = false}) => {
    days = parseInt(days) || 30
    if (ALLOWED_DAYS.indexOf(days) < 0) days = 30
    detail = !!detail
    const key = host + '|' + slug + '|' + days + '|' + (detail ? 'd' : 's')

    const hit = cache.get(key)
    if (hit && Date.now() - hit.time < CACHE_MS) {
        if (!detail) return hit.data
        // the last visit is cheap, keep it current
        const lastVisit = getLastVisit(slug)
        return lastVisit > (hit.data.lastVisit || 0) ? {...hit.data, lastVisit} : hit.data
    }
    // several editors open the same page at the same time: only one computation
    if (pending.has(key)) return pending.get(key)

    const promise = compute(db, {host, slug, days, detail}).then(data => {
        cache.set(key, {time: Date.now(), data})
        if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value)
        return data
    }).finally(() => pending.delete(key))
    pending.set(key, promise)
    return promise
}
