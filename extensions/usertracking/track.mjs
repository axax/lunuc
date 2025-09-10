import {clientAddress, getHostFromHeaders} from '../../util/host.mjs'
import Util from '../../api/util/index.mjs'
import Hook from '../../util/hook.cjs'
import {pubsub} from '../../api/subscription.mjs'
import {DEFAULT_BOT_REGEX} from '../../util/userAgent.mjs'
import {
    TRACK_IS_BOT_HEADER,
    TRACK_REFERER_HEADER,
    TRACK_URL_HEADER,
    TRACK_USER_AGENT_HEADER
} from '../../api/constants/index.mjs'
import {isString} from '../../client/util/json.mjs'

export const trackUser = async ({req, event, slug, db, context, data, meta, path}) => {

    const ip = clientAddress(req)

    if (ip && (req.headers[TRACK_USER_AGENT_HEADER] || (ip !== '::1' && ip !== '127.0.0.1'))) {
        const host = getHostFromHeaders(req.headers)

        let referer
        if (meta) {
            try {
                let metaJson
                if (meta.constructor === Object){
                    metaJson = meta
                } else if(isString(meta) && (meta.startsWith('{') || meta.startsWith('['))) {
                    metaJson = JSON.parse(meta)
                } else {
                    metaJson = meta
                }
                if(metaJson.referer) {
                    referer = metaJson.referer
                }
            } catch (e) {
                console.log(e, meta)
            }
        }

        if (!referer) {
            referer = ''//req.headers['referer']
        }

        let finalRequestUrl = req.headers[TRACK_URL_HEADER] || path || req.url

        const properties = Util.systemProperties()
        const date = new Date()
        const agent = req.headers[TRACK_USER_AGENT_HEADER] || req.headers['user-agent'] || '';

        const insertData = {
            ip: ip,
            agent,
            isBot: req.headers[TRACK_IS_BOT_HEADER] === 'true' ? true : DEFAULT_BOT_REGEX.test(agent),
            referer: req.headers[TRACK_REFERER_HEADER] || referer,
            data,
            /*headers: req.headers,*/
            event,
            host: host,
            server: properties.hostname,
            slug,
            path: finalRequestUrl?finalRequestUrl.split('?')[0]:'',
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
