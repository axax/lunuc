import {ObjectId} from 'mongodb'
import Util from '../../../api/util/index.mjs'
import {getHostFromHeaders} from '../../../util/host.mjs'
import {COLLECTION, getVapidDetails, isValidEndpoint, sendPush} from '../util/push.mjs'

const MAX_DEVICES_PER_USER = 20
const MAX_SETTINGS_LENGTH = 2000

const parseSettings = (settings) => {
    if (!settings) return {}
    if (settings.length > MAX_SETTINGS_LENGTH) {
        throw new Error('Settings are too large')
    }
    const parsed = JSON.parse(settings)
    if (!parsed || parsed.constructor !== Object) {
        throw new Error('Invalid settings')
    }
    return parsed
}

const cleanTopics = topics => [...new Set((topics || []).map(t => String(t).trim().substring(0, 60)).filter(Boolean))].slice(0, 50)

export default db => ({
    Query: {
        pushInfo: async ({endpoint}, req) => {
            const {context} = req
            Util.checkIfUserIsLoggedIn(context)
            const user = new ObjectId(context.id)
            const host = req.headers ? getHostFromHeaders(req.headers) : null
            const [vapid, devices, own] = await Promise.all([
                getVapidDetails(db, host),
                db.collection(COLLECTION).countDocuments({createdBy: user}),
                endpoint ? db.collection(COLLECTION).findOne({endpoint, createdBy: user}) : null
            ])
            return {
                publicKey: vapid.publicKey,
                subscribed: !!own,
                devices,
                settings: own ? JSON.stringify(own.settings || {}) : null,
                topics: own ? own.topics || [] : []
            }
        }
    },
    Mutation: {
        pushSubscribe: async ({subscription, topics, settings}, req) => {
            const {context} = req
            Util.checkIfUserIsLoggedIn(context)
            let sub
            try {
                sub = JSON.parse(subscription)
            } catch (e) {
                throw new Error('Invalid subscription')
            }
            if (!sub || !isValidEndpoint(sub.endpoint) || sub.endpoint.length > 1000 || !sub.keys ||
                typeof sub.keys.p256dh !== 'string' || typeof sub.keys.auth !== 'string' ||
                sub.keys.p256dh.length > 200 || sub.keys.auth.length > 100) {
                throw new Error('Invalid subscription')
            }
            const user = new ObjectId(context.id)
            const collection = db.collection(COLLECTION)
            const set = {
                createdBy: user, // a device belongs to the user that subscribed last (shared computer)
                keys: {p256dh: sub.keys.p256dh, auth: sub.keys.auth},
                lang: context.lang || null,
                userAgent: String((req.headers && req.headers['user-agent']) || '').substring(0, 300),
                modifiedAt: Date.now()
            }
            if (topics) set.topics = cleanTopics(topics)
            if (settings) set.settings = parseSettings(settings)
            await collection.updateOne({endpoint: sub.endpoint}, {$set: set}, {upsert: true})

            // keep only the most recent devices of a user
            const old = await collection.find({createdBy: user}).sort({modifiedAt: -1}).skip(MAX_DEVICES_PER_USER).project({_id: 1}).toArray()
            if (old.length) {
                await collection.deleteMany({_id: {$in: old.map(o => o._id)}})
            }
            return true
        },
        pushSettings: async ({endpoint, settings, topics}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)
            const set = {modifiedAt: Date.now()}
            if (settings) set.settings = parseSettings(settings)
            if (topics) set.topics = cleanTopics(topics)
            const result = await db.collection(COLLECTION).updateOne({endpoint, createdBy: new ObjectId(context.id)}, {$set: set})
            return result.matchedCount > 0
        },
        pushUnsubscribe: async ({endpoint}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)
            const result = await db.collection(COLLECTION).deleteOne({endpoint, createdBy: new ObjectId(context.id)})
            return result.deletedCount > 0
        },
        /* test notification to all devices of the current user, returns the number of devices reached */
        pushTest: async (args, {context}) => {
            Util.checkIfUserIsLoggedIn(context)
            const result = await sendPush(db, {
                userIds: [context.id],
                ttl: 60,
                notification: {title: 'Push test', body: '✅ ' + context.username, tag: 'lunuc-push-test', url: '/'}
            })
            if (result.error) {
                throw new Error(result.error)
            }
            return result.sent
        }
    }
})
