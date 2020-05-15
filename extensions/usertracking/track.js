import {clientAddress, getHostFromHeaders} from '../../util/host'
import Util from '../../api/util'
import Hook from '../../util/hook'

export const trackUser = async ({req, event, slug, db, context, data})=>{

    const ip = clientAddress(req)

    if( ip && ip !== '::ffff:127.0.0.1' && ip !== '::ffff:144.91.119.30' ) {
        const host = getHostFromHeaders(req.headers)

        const insertData = {
            ip: ip.replace('::ffff:',''),
            agent: req.headers['user-agent'],
            referer: req.headers['referer'],
            data,
            event,
            host: host,
            slug,
            createdBy: await Util.userOrAnonymousId(db, context)
        }
        db.collection('UserTracking').insertOne(insertData)
        Hook.call('tracking', {insertData, db, context})
    }

}
