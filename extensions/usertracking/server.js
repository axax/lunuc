import schema from './gensrc/schema'
import resolver from './gensrc/resolver'
import Hook from 'util/hook'
import {deepMergeToFirst} from 'util/deepMerge'
import Util from '../../api/util'
import {clientAddress} from '../../util/host'

// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolver(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schema)
})

Hook.on('cmsCustomResolver', async ({db, segment, context, req, scope}) => {
    if (segment.track && req) {
        db.collection('UserTracking').insertOne({
            ip: clientAddress(req),
            agent: req.headers['user-agent'],
            event: segment.track.event,
            slug: scope.page.slug,
            createdBy: await Util.userOrAnonymousId(db, context)
        })
    }
})
