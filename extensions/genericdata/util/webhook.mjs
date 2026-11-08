/*
 Webhooks for views of api token scopes (see scopedView.mjs) - the receiver gets a record in the
 same format as from the api.

 Configured in a KeyValueGlobal (not exported to files, holds the secret):
   {"url": "https://...", "secret": "...", "active": true, "apiToken": "<ApiToken _id>", "view": "<scope name>"}

 Request: POST <url>, JSON body
   {"event": "updated", "type": "<view name>", "deliveryId": "...", "occurredAt": "<iso>", "data": <record>}
 Headers:
   X-Lunuc-Event: <event>
   X-Lunuc-Delivery: <deliveryId>
   X-Lunuc-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>" with the secret>

 Delivery is asynchronous (never delays the caller), retried after 30s and 5min on network errors,
 5xx, 408 and 429. Webhooks are a notification only - receivers should still sync periodically
 (updatedSince) as a fallback.
 */
import crypto from 'crypto'
import {ObjectId} from 'mongodb'
import Util from '../../../api/util/index.mjs'
import {compileView, toViewRecord} from './scopedView.mjs'

const RETRY_DELAYS_MS = [30000, 300000]
const TIMEOUT_MS = 10000

export const signWebhookBody = (secret, body, timestamp) => {
    const t = timestamp || Math.floor(Date.now() / 1000)
    const v1 = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')
    return `t=${t},v1=${v1}`
}

const deliver = async ({db, config, event, typeName, body, deliveryId, attempt}) => {
    let error, retry = true
    try {
        const res = await fetch(config.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'lunuc-webhook',
                'X-Lunuc-Event': event,
                'X-Lunuc-Delivery': deliveryId,
                'X-Lunuc-Signature': signWebhookBody(config.secret, body)
            },
            body,
            signal: AbortSignal.timeout(TIMEOUT_MS)
        })
        if (res.ok) {
            return
        }
        error = `status ${res.status}`
        // a client error (wrong secret, invalid url ...) won't go away by retrying
        retry = res.status >= 500 || res.status === 408 || res.status === 429
    } catch (e) {
        error = e.message
    }

    if (retry && attempt < RETRY_DELAYS_MS.length) {
        console.warn(`[webhook] ${typeName} ${event} ${deliveryId} failed (${error}), retry ${attempt + 1}`)
        setTimeout(() => deliver({db, config, event, typeName, body, deliveryId, attempt: attempt + 1}), RETRY_DELAYS_MS[attempt]).unref?.()
    } else {
        console.error(`[webhook] ${typeName} ${event} ${deliveryId} failed finally (${error})`)
        try {
            const GenericResolver = (await import('../../../api/resolver/generic/genericResolver.mjs')).default
            await GenericResolver.createEntity(db, {context: {lang: 'en'}}, 'Log', {
                location: 'webhook',
                type: 'error',
                message: `Webhook ${typeName} ${event} failed: ${error}`,
                meta: {url: config.url, deliveryId, body: JSON.parse(body)}
            }, {skipCheck: true})
        } catch (e) {
            console.warn('[webhook] log failed', e.message)
        }
    }
}

/**
 * Sends the current record of entry `id` to the webhook configured in KeyValueGlobal `keyValue`.
 * Does nothing (and costs one cached KeyValue lookup) when the webhook is missing or inactive,
 * or when the entry is not part of the view (anymore).
 */
export const sendViewWebhook = async ({db, keyValue, event, id}) => {
    const config = await Util.getKeyValueGlobal(db, null, keyValue, true)
    if (!config || !config.url || !config.secret || config.active === false || !config.apiToken || !config.view) {
        return
    }
    if (!ObjectId.isValid(String(id)) || !ObjectId.isValid(String(config.apiToken))) {
        return
    }
    const token = await db.collection('ApiToken').findOne({_id: new ObjectId(String(config.apiToken))}, {projection: {scopes: 1}})
    const view = token && token.scopes && token.scopes.genericdata && token.scopes.genericdata[config.view]
    if (!view || !view.type) {
        console.warn(`[webhook] ${keyValue}: view ${config.view} not found in api token`)
        return
    }
    const cv = compileView(view)
    const doc = await db.collection(cv.type).findOne({$and: [{_id: new ObjectId(String(id))}, cv.match]}, {projection: cv.projection})
    if (!doc) {
        return
    }
    const deliveryId = crypto.randomUUID()
    const body = JSON.stringify({
        event,
        type: config.view,
        deliveryId,
        occurredAt: new Date().toISOString(),
        data: toViewRecord(doc, cv)
    })
    deliver({db, config, event, typeName: config.view, body, deliveryId, attempt: 0})
}
