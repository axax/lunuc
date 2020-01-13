import schema from './gensrc/schema'
import resolver from './gensrc/resolver'
import Hook from 'util/hook'
import {deepMergeToFirst} from 'util/deepMerge'
import Util from '../../api/util'
import {clientAddress, getHostFromHeaders} from '../../util/host'


// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolver(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schema)
})

Hook.on('cmsCustomResolver', async ({db, segment, context, req, scope, editmode}) => {
    if (segment.track && req && !editmode) {
        const ip = clientAddress(req)


        if( ip && ip !== '::ffff:127.0.0.1') {
            const host = getHostFromHeaders(req.headers)

            const data = {
                ip: ip.replace('::ffff:',''),
                agent: req.headers['user-agent'],
                referer: req.headers['referer'],
                event: segment.track.event,
                host: host,
                slug: scope.page.slug,
                createdBy: await Util.userOrAnonymousId(db, context)
            }
            db.collection('UserTracking').insertOne(data)
            Hook.call('tracking', {data, db, context})
        }
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
