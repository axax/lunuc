import cronjobUtil from '../cronjobUtil.mjs'
import Util from '../../../api/util/index.mjs'
import {CAPABILITY_RUN_SCRIPT} from '../../../util/capabilities.mjs'
import {ObjectId} from 'mongodb'

export default db => ({
    Query: {
        runCronJob: async ({meta,...props}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_RUN_SCRIPT)
            let result

            let metaJson = {}

            if(meta){
                metaJson = JSON.parse(meta)
            }

            if(props.script == undefined && props.cronjobId) {
                const cronJob = (await db.collection('CronJob').findOne({_id: new ObjectId(props.cronjobId)}))
                if(cronJob){
                    props.script = cronJob.script
                }
            }


            if (props.sync) {
                await new Promise(resolve => {
                    cronjobUtil.runCronJob({db, context, meta: metaJson, ...props}, (_result) => {
                        result = _result
                        resolve()
                    })
                })
            } else {
                result = await cronjobUtil.runCronJob({db, context, meta: metaJson, ...props})
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
