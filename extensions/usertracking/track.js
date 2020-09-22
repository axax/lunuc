import {clientAddress, getHostFromHeaders} from '../../util/host'
import Util from '../../api/util'
import Hook from '../../util/hook'
import {pubsub} from '../../api/subscription'

export const trackUser = async ({req, event, slug, db, context, data, meta}) => {

    const ip = clientAddress(req)


    if (ip && ip !== '::1' && ip !== '::ffff:127.0.0.1' && ip !== '::ffff:144.91.119.30') {
        const host = getHostFromHeaders(req.headers)

        let referer
        if (meta) {

            try {
                const metaJson = JSON.parse(meta)
                referer = metaJson.referer
            } catch (e) {
                console.log(e)
            }
        }

        if (!referer) {
            referer = req.headers['referer']
        }

        const insertData = {
            ip: ip.replace('::ffff:', ''),
            agent: req.headers['user-agent'],
            referer,
            data,
            event,
            host: host,
            slug,
            createdBy: await Util.userOrAnonymousId(db, context)
        }

        Hook.call('tracking', {insertData, db, context})
        db.collection('UserTracking').insertOne(insertData).then(result => {
            insertData._id = result.insertedId
            if (insertData.data && insertData.data.constructor === Object) {
                insertData.data = JSON.stringify(result.insertedId)
            }

            // for real time tracking
            pubsub.publish('subscribeUserTracking', {
                userId: context.id,
                subscribeUserTracking: {action: 'create', data: [insertData]}
            })
        }).catch(err => {
            // handle error
        })

    }

}
