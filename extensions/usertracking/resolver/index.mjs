
import {trackUser} from '../track.mjs'
import {pageStats} from '../pagestats.mjs'
import Util from '../../../api/util/index.mjs'
import {getHostFromHeaders} from '../../../util/host.mjs'
import {CAPABILITY_VIEW_CMS_EDITOR} from '../../cms/constants/index.mjs'


export default db => ({
    Query: {
        // statistics of one page for the analytics tab in the cms editor (always of the host the editor runs on)
        userTrackingPageStats: async ({slug, days, detail}, req) => {
            const {context} = req
            Util.checkIfUserIsLoggedIn(context)
            if (!(await Util.userHasCapability(db, context, CAPABILITY_VIEW_CMS_EDITOR))) {
                throw new Error('user has no permission to view the page statistics')
            }
            const host = getHostFromHeaders(req.headers) || ''
            return JSON.stringify(await pageStats(db, {host, slug, days, detail}))
        }
    },
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
