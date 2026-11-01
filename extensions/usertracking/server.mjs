import schema from './schema/index.mjs'
import resolver from './resolver/index.mjs'
import genSchema from './gensrc/schema.mjs'
import genResolver from './gensrc/resolver.mjs'
import Hook from '../../util/hook.cjs'
import {deepMergeToFirst} from '../../util/deepMerge.mjs'
import {clientAddress, getHostFromHeaders, isTrustedProxyAddress} from '../../util/host.mjs'
import {trackUser, trackEvent, trackBeacon} from './track.mjs'
import React from 'react'
import Util from '../../api/util/index.mjs'
import {TRACK_USER_AGENT_HEADER} from '../../api/constants/index.mjs'

// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolver(db), genResolver(db))
})

// batch of tracking events from the web server (pages served from the html cache), see server/util/tracking.mjs
// only accepted from localhost / trusted proxies, answers immediately
Hook.on('appready', ({app}) => {
    if (!app) return
    app.post('/tracking/batch', (req, res) => {
        const remote = req.socket && req.socket.remoteAddress
        if (!remote || !isTrustedProxyAddress(remote)) {
            res.status(403).end()
            return
        }
        const events = req.body && Array.isArray(req.body.events) ? req.body.events : []
        res.status(204).end()
        for (const e of events.slice(0, 5000)) {
            if (!e || typeof e !== 'object') continue
            trackEvent({
                ip: typeof e.ip === 'string' ? e.ip : '',
                agent: typeof e.agent === 'string' ? e.agent.substring(0, 1000) : '',
                host: typeof e.host === 'string' ? e.host.split(':')[0].toLowerCase() : '',
                path: typeof e.path === 'string' ? e.path.substring(0, 2000) : '',
                referer: typeof e.referer === 'string' ? e.referer.substring(0, 2000) : '',
                isBotHeader: e.isBot === true ? true : undefined,
                event: typeof e.event === 'string' ? e.event : 'visit'
            })
        }
    })
})

// page view beacon of the browser (navigator.sendBeacon, text/plain json, max 4 KB)
// answers immediately with 204, the entry is only queued (see track.mjs)
Hook.on('appready', ({app}) => {
    if (!app) return
    app.post('/graphql/tracking/beacon', (req, res) => {
        let body = '', tooLarge = false
        req.setEncoding('utf8')
        req.on('data', chunk => {
            if (tooLarge) return
            body += chunk
            if (body.length > 4096) {
                tooLarge = true
                body = ''
            }
        })
        req.on('end', () => {
            res.status(204).end()
            if (!tooLarge) trackBeacon({req, body})
        })
        req.on('error', () => {
            if (!res.headersSent) res.status(400).end()
        })
    })
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(genSchema)
    schemas.push(schema)
})

Hook.on('track404', ({req, event, slug, db, context, data, meta}) => {
    trackUser({req, event, context, db, slug, data, meta})
})

Hook.on('cmsCustomResolver', async ({db, segment, context, req, scope, editmode, dynamic}) => {
    if (segment.track && req && (segment.track.force || (!editmode && !dynamic))) {
        trackUser({
            req,
            event: segment.track.event,
            context,
            db,
            slug: scope.page.slug,
            data: scope.params,
            meta: scope.page.meta
        })
    }
})


Hook.on('typeBeforeCreate', ({type, data, req}) => {
    if (type === 'UserTracking') {
        if (!data.ip) {
            data.ip = clientAddress(req)
        }
        if (!data.agent) {
            data.agent = req.headers[TRACK_USER_AGENT_HEADER] || req.headers['user-agent']
        }
        if (!data.referer) {
            data.referer = req.headers['referer']
        }
        if (!data.host) {
            data.host = getHostFromHeaders(req.headers)
        }


        const date = new Date()
        data.day = date.getDate()
        data.month = date.getMonth() + 1
        data.year = date.getFullYear()

    }
})


// add some extra data to the table
Hook.on('cmsPageStatus', async ({db, slug, req, data}) => {

    const keys = ['CmsViewContainerSettings']
    const keyvalueMap = (await Util.keyvalueMap(db, req.context, keys, {cache: true, parse: true}))

    if (keyvalueMap.CmsViewContainerSettings && keyvalueMap.CmsViewContainerSettings.tracking) {

        const countTotal = await db.collection('UserTracking').count({slug})
        const lastEntry = await db.collection('UserTracking').findOne({slug}, {sort: {_id: -1}})
        data.usertracking = {countTotal, lastEntry}
    }

})
