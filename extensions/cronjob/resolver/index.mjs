import cronjobUtil from '../cronjobUtil.mjs'
import Util from '../../../api/util/index.mjs'
import {CAPABILITY_RUN_SCRIPT} from '../../../util/capabilities.mjs'

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
            const match = !filter || Util.execFilter(filter)
            return {match}
        }
    }
})