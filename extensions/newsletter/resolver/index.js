import {ObjectId} from "mongodb";
import Util from '../../../api/util'
import {CAPABILITY_RUN_SCRIPT} from '../../../util/capabilities'
import {sendMail} from "../../../api/util/mail";
import crypto from "crypto";

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
                if (emails.length > batchSize) {
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

                    const result = await sendMail(db, req.context, {
                        slug: template,
                        recipient: sub.email,
                        subject,
                        body: sub,
                        text,
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
        subscribeNewsletter: async ({email, meta, list}, {context}) => {

            const collection = db.collection('NewsletterSubscriber')

            // check if there is a user with same email
            const user = (await db.collection('User').findOne({email}))

            // insert or update
            const data = {
                $set: {
                    email,
                    state: 'subscribed',
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
            const insertResult = await collection.updateOne(
                {email}, data, {upsert: true}
            )

            if (insertResult.modifiedCount || insertResult.matchedCount || insertResult.upsertedCount) {
                return {status: 'ok'}
            }
        },
        unsubscribeNewsletter: async ({email, token}, {context}) => {

            const collection = db.collection('NewsletterSubscriber')


            let result = (await collection.findOneAndUpdate({email, token}, {
                $set: {
                    state: 'unsubscribed'
                }
            }, {returnOriginal: false}))

            if (result.ok) {
                return {status: 'ok'}
            }
        }
    }
})
