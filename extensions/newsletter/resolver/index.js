import {ObjectId} from "mongodb";
import Util from '../../../api/util'
import {CAPABILITY_RUN_SCRIPT} from '../../../util/capabilities'
import {sendMail} from "../../../api/util/mail";
import crypto from "crypto";
import {getHostFromHeaders} from "../../../util/host";

export default db => ({
    Query: {
        sendNewsletter: async ({mailing, subject, template, text, batchSize, list}, req) => {
            await Util.checkIfUserHasCapability(db, req.context, CAPABILITY_RUN_SCRIPT)
            let result

            if(!batchSize){
                batchSize = 10
            }

            const subscribers = await db.collection('NewsletterSubscriber').find(
                {state: 'subscribed', list: {$in: list.map(l => l.constructor===String?ObjectId(l):l)}}
            ).toArray()

            const emails = []

            for (let i = 0; i < subscribers.length; i++) {
                if (emails.length >= batchSize) {
                    break
                }
                const sub = subscribers[i]

                const sent = await db.collection('NewsletterSent').findOne(
                    {
                        subscriber: sub._id,
                        mailing: ObjectId(mailing)
                    }
                )
                if (!sent) {

                    sub.account = await db.collection('User').findOne(
                        {_id: ObjectId(sub.account)}
                    )
                    if (!sub.token) {
                        sub.token = crypto.randomBytes(32).toString("hex")

                        await db.collection('NewsletterSubscriber').updateOne({_id: ObjectId(sub._id)}, {$set: {token: sub.token}})

                    }
                    sub.mailing = mailing

                    const headerList = {
                        // List-Help: <mailto:admin@example.com?subject=help>
                        //help: 'admin@example.com?subject=help',
                        // List-Unsubscribe: <http://example.com> (Comment)
                        unsubscribe: {
                            url: `${(req.isHttps ? 'https://' : 'http://')}${getHostFromHeaders(req.headers)}/core/unsubscribe-newsletter?email=${sub.email}&token=${sub.token}&mailing=${sub.mailing}`,
                            comment: 'Unsubscribe'
                        }
                    }

                    const result = await sendMail(db, req.context, {
                        slug: template,
                        recipient: sub.email,
                        subject,
                        body: sub,
                        text,
                        headerList,
                        req
                    })
                    emails.push(sub.email)

                    db.collection('NewsletterSent').insertOne(
                        {
                            subscriber: sub._id,
                            mailing: ObjectId(mailing),
                            mailResponse: result
                        }
                    )
                }

            }
            return {
                status: 'Newsletter sent to: ' + emails.join(',')
            }
        },
        subscribeNewsletter: async ({email, location, url, meta, list}, req) => {

            const {context}  = req

            const collection = db.collection('NewsletterSubscriber')

            // check if there is a user with same email
            const user = (await db.collection('User').findOne({email}))

            const token = crypto.randomBytes(32).toString("hex")
            // insert or update
            const data = {
                $set: {
                    token,
                    email,
                    location,
                    state: 'optin',
                    meta: meta ? JSON.parse(meta) : undefined
                }
            }

            if (user && user._id) {
                data.$set.account = user._id
            }

            if (list) {
                data.$addToSet = {
                    list: {
                        $each: (list ? list.reduce((o, id) => {
                            o.push(ObjectId(id));
                            return o
                        }, []) : list)
                    }

                }
            }

            const selector = {email}
            if(location){
                selector.location = location
            }

            const insertResult = await collection.updateOne(
                selector, data, {upsert: true}
            )

            if (insertResult.modifiedCount || insertResult.matchedCount || insertResult.upsertedCount) {

                let finalUrl
                if(url){
                    finalUrl = url
                }else{
                    finalUrl = (req.isHttps ? 'https://' : 'http://') + getHostFromHeaders(req.headers) + '/core/newsletter/optin/confirm'
                }

                await sendMail(db, context, {
                    slug: 'core/newsletter/optin/mail',
                    recipient: email,
                    subject: 'Anmeldung Newsletter',
                    body: `{"url":"${finalUrl}?token=${token}&location=${location || ''}"}`,
                    req
                })

                return {status: 'ok'}
            }
        },
        confirmNewsletter: async ({email, token, location}, {context}) => {

            const selector = {}
            if(email){
                selector.email = email
            }
            if(token){
                selector.token = token
            }
            if(location){
                selector.location = location
            }
            const $set = {
                confirmed: true,
                state: 'subscribed'
            }

            let result = (await db.collection('NewsletterSubscriber').findOneAndUpdate(selector, {
                $set
            }, {returnOriginal: false}))

            if (result.ok) {
                return {status: 'ok'}
            }
        },
        unsubscribeNewsletter: async ({email, token, mailing}, {context}) => {

            const collection = db.collection('NewsletterSubscriber')

            const $set = {
                state: 'unsubscribed'
            }
            if(mailing !== undefined){
                $set.unsubscribeMailing = mailing?ObjectId(mailing):null
            }

            let result = (await collection.findOneAndUpdate({email, token}, {
                $set
            }, {returnOriginal: false}))

            if (result.ok) {
                return {status: 'ok'}
            }
        }
    }
})
