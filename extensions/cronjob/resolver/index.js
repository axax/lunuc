import cronjobUtil from '../cronjobUtil'
import Util from 'api/util'
import {CAPABILITY_RUN_SCRIPT} from '../../../util/capabilities'

export default db => ({
    Query: {
        runCronJob: async ({script, scriptLanguage}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_RUN_SCRIPT)

           // const id = await cronjobUtil.runCronJob({cronjobId, script, scriptLanguage, context, db})
            return {status: `Job started. CronJobExecution`}
        },
        testJob: async ({script, scriptLanguage, cronjobId}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_RUN_SCRIPT)

            const id = await cronjobUtil.runCronJob({cronjobId, script, scriptLanguage, context, db})
            return {status: `Job started. CronJobExecution id is ${id}`}
        },
        testExecFilter: ({filter}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)
            const match = cronjobUtil.execFilter(filter)
            return {match}
        }
    }
})
