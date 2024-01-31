import {clientAddress, getHostFromHeaders} from '../../util/host.mjs'
import Util from '../../api/util/index.mjs'
import Hook from '../../util/hook.cjs'
import {pubsub} from '../../api/subscription.mjs'

export const trackUser = async ({req, event, slug, db, context, data, meta}) => {

    const ip = clientAddress(req)

    if (ip && (req.headers['x-track-user-agent'] || (ip !== '::1' && ip !== '127.0.0.1'))) {
        const host = getHostFromHeaders(req.headers)

        let referer
        if (meta) {
            let metaJson
            try {
                if (meta.constructor !== Object && (meta.startsWith('{') || meta.startsWith('['))) {
                    metaJson = JSON.parse(meta)
                } else {
                    metaJson = meta
                }
                referer = metaJson.referer
            } catch (e) {
                console.log(e, meta)
            }
        }

        if (!referer) {
            referer = ''//req.headers['referer']
        }

        const date = new Date()
        const insertData = {
            ip: ip,
            agent: req.headers['x-track-user-agent'] || req.headers['user-agent'],
            isBot: req.headers['x-track-is-bot'] === 'true' ? true : false,
            referer: req.headers['x-referer'] || referer,
            data,
            /*headers: req.headers,*/
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
                insertData.data = JSON.stringify(insertData.data)
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
