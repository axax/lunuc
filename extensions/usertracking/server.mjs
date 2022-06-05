import schema from './gensrc/schema.mjs'
import resolver from './gensrc/resolver.mjs'
import Hook from '../../util/hook.cjs'
import {deepMergeToFirst} from '../../util/deepMerge.mjs'
import {clientAddress, getHostFromHeaders} from '../../util/host.mjs'
import {trackUser} from './track.mjs'
import React from 'react'
import Util from '../../api/util/index.mjs'

// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolver(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schema)
})

Hook.on('trackMail', ({req, event, slug, db, context, data, meta}) => {
    trackUser({req, event, context, db, slug, data, meta})
})

Hook.on('cmsCustomResolver', async ({db, segment, context, req, scope, editmode, dynamic}) => {
    if (segment.track && req && !editmode && !dynamic) {
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
            const ip = clientAddress(req)
            data.ip = ip.replace('::ffff:', '')
        }
        if (!data.agent) {
            data.agent = req.headers['x-track-user-agent'] || req.headers['user-agent']
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
