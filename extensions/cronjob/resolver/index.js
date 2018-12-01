import cronjobUtil from '../cronjobUtil'
import Util from 'api/util'

export default db => ({
    testJob: async ({script, cronjobId}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)
        const id = await cronjobUtil.runScript({cronjobId, script, context, db})
        return {status: `Job started. CronJobExecution id is ${id}`}
    },
    testExecFilter: ({filter}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)
        const match = cronjobUtil.execFilter(filter)
        return {match}
    }
})
