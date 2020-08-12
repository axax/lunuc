import {ObjectId} from "mongodb";

export default db => ({
    Query: {
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
