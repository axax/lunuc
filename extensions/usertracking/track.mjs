import {clientAddress, getHostFromHeaders} from '../../util/host.mjs'
import Util from '../../api/util/index.mjs'
import Hook from '../../util/hook.cjs'
import url from 'url'
import {pubsub} from '../../api/subscription.mjs'
import {DEFAULT_BOT_REGEX} from '../../util/userAgent.mjs'
import {
    TRACK_IS_BOT_HEADER,
    TRACK_REFERER_HEADER,
    TRACK_URL_HEADER,
    TRACK_USER_AGENT_HEADER
} from '../../api/constants/index.mjs'
import {isString, parseOrElse} from '../../client/util/json.mjs'
import {dynamicSettings} from '../../api/util/settings.mjs'
import {ObjectId} from 'mongodb'


const USER_TRACKING_SETTINGS = {}

const TRACKING_BUFFER = {entries: []}

// Hook when db is ready
Hook.on('appready', async ({context, db}) => {
    TRACKING_BUFFER.db = db
    await dynamicSettings({db, context, settings: USER_TRACKING_SETTINGS, key:'UserTrackingSettings'})
})

Hook.on('appexit', async () => {
    await flushBufferIfNeeded(true)
})


const TRACKING_ENTRIES_BUFFER_SIZE = 100;
const flushBufferIfNeeded = async (force) => {

    if (TRACKING_BUFFER.entries.length ===  0 || (!force && TRACKING_BUFFER.entries.length < TRACKING_ENTRIES_BUFFER_SIZE)) {
        return
    }

    const bulkOps = TRACKING_BUFFER.entries.map(doc => ({ insertOne: { document: doc } }))

    console.log(`inserted user tracking buffer entries: ${TRACKING_BUFFER.entries.length}`)
    await TRACKING_BUFFER.db.collection('UserTracking').bulkWrite(bulkOps, {ordered: false})

    TRACKING_BUFFER.entries = []

}

function forceString(data) {
    return data && data.constructor !== String ? JSON.stringify(data) : data;
}

export const trackUser = async ({req, event, slug, db, context, data, meta}) => {
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

        let finalRequestUrl =  getPathFromHeader(req)

        const properties = Util.systemProperties()
        const date = new Date()
        const agent = req.headers[TRACK_USER_AGENT_HEADER] || req.headers['user-agent'] || '';

        const insertData = {
            _id: new ObjectId(),
            ip: ip,
            agent,
            isBot: req.headers[TRACK_IS_BOT_HEADER] === 'true' ? true : DEFAULT_BOT_REGEX.test(agent),
            referer: req.headers[TRACK_REFERER_HEADER] || referer || '',
            data: parseOrElse(data),
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

        if(USER_TRACKING_SETTINGS.includeRequestHeader){
            insertData.headers = req.headers
        }
        TRACKING_BUFFER.entries.push(insertData)


        // for real time tracking
        pubsub.publish('subscribeUserTracking', {
            userId: context.id,
            subscribeUserTracking: {action: 'create', data: [{...insertData,
                    data: forceString(insertData.data),
                    headers: forceString(insertData.headers)
            }]}
        })

        Hook.call('tracking', {insertData, db, context})

        await flushBufferIfNeeded()
    }
}


function getPathFromHeader(req) {
    if(req.headers[TRACK_URL_HEADER]){
        return req.headers[TRACK_URL_HEADER]
    }else if (req.headers['referer']) {
        // is from graphql
        const parsedUrl = url.parse(req.headers['referer'], true)
        return parsedUrl.pathname
    }
    return req.url
}