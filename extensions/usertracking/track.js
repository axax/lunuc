import {clientAddress, getHostFromHeaders} from '../../util/host'
import Util from '../../api/util'
import Hook from '../../util/hook'
import {pubsub} from '../../api/subscription'

export const trackUser = async ({req, event, slug, db, context, data, meta}) => {

    const ip = clientAddress(req)

    if (ip && (req.headers['x-track-user-agent'] || (ip !== '::1' && ip !== '::ffff:127.0.0.1'))) {
        const host = getHostFromHeaders(req.headers)

        let referer
        if (meta) {
            let metaJson
            try {
                if (meta.constructor !== Object) {
                    metaJson = JSON.parse(meta)
                } else {
                    metaJson = meta
                }
                referer = metaJson.referer
            } catch (e) {
                console.log(e)
            }
        }

        if (!referer) {
            referer = ''//req.headers['referer']
        }

        const date = new Date()
        const insertData = {
            ip: ip.replace('::ffff:', ''),
            agent: req.headers['x-track-user-agent'] || req.headers['user-agent'],
            isBot: req.headers['x-track-is-bot'] === 'true' ? true : false,
            referer,
            data,
            event,
            host: host,
            slug,
            day: date.getDate(),
            month: date.getMonth() + 1,
            year: date.getFullYear(),
            createdBy: await Util.userOrAnonymousId(db, context)
        }

        Hook.call('tracking', {insertData, db, context})
        db.collection('UserTracking').insertOne(insertData).then(result => {
            insertData._id = result.insertedId
            if (insertData.data && insertData.data.constructor === Object) {
                insertData.data = JSON.stringify(result.insertedId)
            }

            // for real time tracking
            console.log(insertData)
            pubsub.publish('subscribeUserTracking', {
                userId: context.id,
                subscribeUserTracking: {action: 'create', data: [insertData]}
            })
        }).catch(err => {
            // handle error
        })

    }

}
