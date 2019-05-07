import GenericResolver from "../../../api/resolver/generic/genericResolver";
import {ObjectId} from "mongodb";

export default db => ({
    Query: {
        subscribeNewsletter: async ({email, list}, {context}) => {

            const collection = db.collection('NewsletterSubscriber')
            const insertResult = await collection.insertOne(
                {email, list: (list ? ObjectId(list) : list)}
            )

            if (insertResult.insertedCount) {
                return {status: 'ok'}
            }
        }
    }
})
