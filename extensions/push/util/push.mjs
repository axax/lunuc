/*
 * Web push (generic).
 *
 * Sending - from an extension (no import needed, nothing happens if the push extension is off):
 *   Hook.call('pushSend', {db, userIds: [id], notification: {title, body, url}})
 * from a script in the db (CronJob, Hook, Api):
 *   const {sendPush} = await requireAsync('@ext/push/util/push.mjs')
 *   await sendPush(this.db, {topic: 'news', notification: {title: 'Hello', body: '...', url: '/'}})
 *
 * options:
 *   userIds       users that get the notification on all their devices
 *   topic         all devices that subscribed to this topic (_app_.push.subscribe({topics: ['news']}))
 *   notification  {title, body, url, icon, badge, image, tag, renotify, silent, requireInteraction,
 *                  skipIfFocused, data} or a function (subscription) => notification | null,
 *                 e.g. to respect the settings / language of a device (subscription.settings, .lang,
 *                 .createdBy = user)
 *                 skipIfFocused: true = not shown while a window with this url (or a sub path) has
 *                 the focus; a string = path prefix to compare with instead of url
 *   ttl           seconds the push service keeps the message for an offline device (default 1 day)
 *   urgency       very-low | low | normal | high
 * Resolves with {sent, failed, removed} and never rejects. Subscriptions that are gone (the user
 * removed the permission, uninstalled the browser ...) are deleted.
 */
import {ObjectId} from 'mongodb'

// type PushSubscription (build.json): one entry per device, createdBy = user of the device
export const COLLECTION = 'PushSubscription'
const CONFIG_COLLECTION = 'PushConfig'
const MAX_BODY_LENGTH = 300

// push services of the browsers. The endpoint comes from the client and the server sends requests
// to it, so anything else is refused (otherwise a user could make the server call internal urls)
const PUSH_SERVICE_HOSTS = [
    /^fcm\.googleapis\.com$/,
    /^android\.googleapis\.com$/,
    /\.push\.services\.mozilla\.com$/,
    /\.notify\.windows\.com$/,
    /^web\.push\.apple\.com$/,
    /\.push\.apple\.com$/
]

let webpushPromise, vapidPromise

const getWebpush = () => {
    if (!webpushPromise) {
        webpushPromise = import('web-push').then(m => m.default || m)
        webpushPromise.catch(() => {
            webpushPromise = null
        })
    }
    return webpushPromise
}

export const isValidEndpoint = (endpoint) => {
    try {
        const url = new URL(endpoint)
        return url.protocol === 'https:' && !url.username && !url.password && PUSH_SERVICE_HOSTS.some(r => r.test(url.hostname))
    } catch (e) {
        return false
    }
}

/*
 * VAPID keys identify this server towards the push services. They are created once and must
 * never change - every existing subscription would be lost. Stored in the db (collection
 * PushConfig) or set with LUNUC_PUSH_PUBLIC_KEY / LUNUC_PUSH_PRIVATE_KEY.
 */
export const getVapidDetails = (db, host) => {
    if (!vapidPromise) {
        vapidPromise = (async () => {
            const env = process.env
            let subject = env.LUNUC_PUSH_SUBJECT
            if (env.LUNUC_PUSH_PUBLIC_KEY && env.LUNUC_PUSH_PRIVATE_KEY) {
                return {subject: subject || 'mailto:webmaster@localhost', publicKey: env.LUNUC_PUSH_PUBLIC_KEY, privateKey: env.LUNUC_PUSH_PRIVATE_KEY}
            }
            const config = db.collection(CONFIG_COLLECTION)
            let doc = await config.findOne({_id: 'vapid'})
            if (!doc) {
                const keys = (await getWebpush()).generateVAPIDKeys()
                const isPublicHost = host && !/^(localhost|127\.|\[)/.test(host)
                // $setOnInsert: with several instances only the first one writes its keys
                await config.updateOne({_id: 'vapid'}, {
                    $setOnInsert: {
                        publicKey: keys.publicKey,
                        privateKey: keys.privateKey,
                        subject: isPublicHost ? 'https://' + host.split(':')[0] : 'mailto:webmaster@lunuc.local',
                        createdAt: new Date()
                    }
                }, {upsert: true})
                doc = await config.findOne({_id: 'vapid'})
            }
            return {subject: subject || doc.subject, publicKey: doc.publicKey, privateKey: doc.privateKey}
        })()
        vapidPromise.catch(() => {
            vapidPromise = null
        })
    }
    return vapidPromise
}

const toObjectIds = ids => (ids || []).filter(id => id && ObjectId.isValid(String(id))).map(id => new ObjectId(String(id)))

const buildPayload = (notification) => {
    const n = {...notification}
    n.title = String(n.title || '').substring(0, 120)
    if (n.body) {
        const body = String(n.body)
        n.body = body.length > MAX_BODY_LENGTH ? body.substring(0, MAX_BODY_LENGTH - 1) + '…' : body
    }
    return JSON.stringify(n)
}

export const sendPush = async (db, {userIds, topic, notification, ttl = 24 * 60 * 60, urgency} = {}) => {
    const result = {sent: 0, failed: 0, removed: 0}
    try {
        const or = []
        const users = toObjectIds(userIds)
        if (users.length) or.push({createdBy: {$in: users}})
        if (topic) or.push({topics: String(topic)})
        if (!or.length || !notification) {
            return result
        }
        const subscriptions = await db.collection(COLLECTION).find(or.length > 1 ? {$or: or} : or[0]).toArray()
        if (!subscriptions.length) {
            return result
        }
        const [webpush, vapidDetails] = await Promise.all([getWebpush(), getVapidDetails(db)])
        const options = {vapidDetails, TTL: ttl}
        if (urgency) options.urgency = urgency

        const gone = []
        await Promise.all(subscriptions.map(async sub => {
            try {
                if (!isValidEndpoint(sub.endpoint)) {
                    // e.g. an entry created by hand: never send requests to other hosts
                    result.failed++
                    return
                }
                const n = typeof notification === 'function' ? notification(sub) : notification
                if (!n) return
                await webpush.sendNotification({endpoint: sub.endpoint, keys: sub.keys}, buildPayload(n), options)
                result.sent++
            } catch (e) {
                result.failed++
                if (e && (e.statusCode === 404 || e.statusCode === 410)) {
                    gone.push(sub._id)
                } else {
                    console.warn('push failed', e && (e.statusCode || e.message), e && e.body ? String(e.body).substring(0, 200) : '')
                }
            }
        }))
        if (gone.length) {
            await db.collection(COLLECTION).deleteMany({_id: {$in: gone}})
            result.removed = gone.length
        }
        if (result.sent) {
            db.collection(COLLECTION).updateMany({_id: {$in: subscriptions.map(s => s._id)}}, {$set: {lastPushAt: Date.now()}}).catch(() => {})
        }
    } catch (e) {
        console.error('sendPush', e)
        result.error = e.message
    }
    return result
}
