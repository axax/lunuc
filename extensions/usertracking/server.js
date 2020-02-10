import schema from './gensrc/schema'
import resolver from './gensrc/resolver'
import Hook from 'util/hook'
import {deepMergeToFirst} from 'util/deepMerge'
import {clientAddress, getHostFromHeaders} from '../../util/host'
import {trackUser} from './track'

// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolver(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schema)
})

Hook.on('trackUser', ({req, event, slug, db, context}) => {
    trackUser({req, event, context, db, slug})
})

Hook.on('cmsCustomResolver', async ({db, segment, context, req, scope, editmode}) => {
    if (segment.track && req && !editmode) {
        trackUser({req, event: segment.track.event, context, db, slug: scope.page.slug})
    }
})


Hook.on('typeBeforeCreate', ({type, data, req}) => {
    if( type==='UserTracking'){
        if( !data.ip ){
            const ip = clientAddress(req)
            data.ip=ip.replace('::ffff:','')
        }
        if( !data.agent ){
            data.agent=req.headers['user-agent']
        }
        if( !data.referer ){
            data.referer=req.headers['referer']
        }
        if( !data.host ){
            data.host=getHostFromHeaders(req.headers)
        }
    }
})
