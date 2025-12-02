
import {trackUser} from '../track.mjs'


export default db => ({
    Mutation: {
        doTracking: async ({event}, req) => {
            const {context} = req
            await trackUser({
                req,
                event,
                context,
                db
            })
            return {status:'tracked'}
        }
    }
})
