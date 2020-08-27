import {ObjectId} from "mongodb";
import Util from '../../../api/util'
import {CAPABILITY_RUN_SCRIPT} from '../../../util/capabilities'
import {sendMail} from "../../../api/util/mail";

export default db => ({
    Query: {
        sendNewsletter: async ({subject, template,list}, req) => {
            await Util.checkIfUserHasCapability(db, req.context, CAPABILITY_RUN_SCRIPT)
            let result

            const subscribers = await db.collection('NewsletterSubscriber').find(
                { list: { $in: list.map(l=>ObjectId(l)) } }
            ).toArray()

            subscribers.forEach(async sub=>{
                await sendMail(db, req.context, {slug:template, recipient: sub.email, subject, body: '{}', req})

            })

            return {
                status: 'Newsletter sent'
            }
        },
        subscribeNewsletter: async ({email, meta, list}, {context}) => {

            const collection = db.collection('NewsletterSubscriber')
            const insertResult = await collection.insertOne(
                {email,
                    meta: meta?JSON.parse(meta):undefined,
                    list:(list?list.reduce((o,id)=>{o.push(ObjectId(id));return o},[]):list)}
            )

            if (insertResult.insertedCount) {
                return {status: 'ok'}
            }
        }
    }
})
