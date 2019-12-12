import cronjobUtil from '../cronjobUtil'
import Util from 'api/util'
import {CAPABILITY_RUN_SCRIPT} from '../../../util/capabilities'

export default db => ({
    Query: {
        runCronJob: async (props, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_RUN_SCRIPT)
            let result
            if (props.sync) {
                await new Promise(resolve => {
                    cronjobUtil.runCronJob({db, context, ...props}, (_result) => {
                        result = _result
                        resolve()
                    })
                })
            } else {
                result = await cronjobUtil.runCronJob({db, context, ...props})
            }


            return {
                status: props.sync ? 'Job finished' : `Job started. CronJobExecution id is ${result._id}`,
                result: JSON.stringify(result)
            }
        },
        testExecFilter: ({filter}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)
            const match = cronjobUtil.execFilter(filter)
            return {match}
        }
    }
})
