import cronjobUtil from '../cronjobUtil.mjs'
import Util from '../../../api/util/index.mjs'
import {CAPABILITY_MANAGE_OTHER_USERS, CAPABILITY_RUN_SCRIPT} from '../../../util/capabilities.mjs'
import {ObjectId} from 'mongodb'
import {userHasAccessToObject} from '../../../api/util/access.mjs'

export default db => ({
    Query: {
        runCronJob: async ({meta, ...props}, {context}) => {

            let result
            let metaJson = {}
            if (meta) {
                metaJson = JSON.parse(meta)
            }

            if (props.script == undefined && props.cronjobId) {
                const cronJob = (await db.collection('CronJob').findOne({_id: new ObjectId(props.cronjobId)}))
                if (cronJob) {
                    props.script = cronJob.script
                }
                if (!userHasAccessToObject(context, cronJob)) {
                    // throw an error if use has no access to run this cronjob
                    await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_OTHER_USERS)
                }
            } else {
                await Util.checkIfUserHasCapability(db, context, CAPABILITY_RUN_SCRIPT)
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
        },

        /**
         * Returns all cronjobs that are currently running in this process.
         * Note: the lock is kept in memory, so with multiple node instances
         * this only reflects the instance that handles the request.
         */
        getRunningCronJobs: async (_, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_RUN_SCRIPT)

            const running = cronjobUtil.getRunningCronJobs()
            if (running.length === 0) {
                return []
            }

            const ids = running.reduce((acc, job) => {
                if (job.cronjobId && ObjectId.isValid(job.cronjobId)) {
                    acc.push(new ObjectId(job.cronjobId))
                }
                return acc
            }, [])

            const cronJobs = ids.length ? await db.collection('CronJob').find({_id: {$in: ids}}).toArray() : []
            const cronJobById = cronJobs.reduce((acc, cronJob) => {
                acc[cronJob._id.toString()] = cronJob
                return acc
            }, {})

            return running.map(job => {
                const cronJob = cronJobById[job.cronjobId]
                return {
                    cronjobId: job.cronjobId,
                    executionId: job.executionId ? job.executionId.toString() : null,
                    name: cronJob ? cronJob.name : null,
                    startTime: job.startTime,
                    runtime: job.runtime,
                    killable: job.killable
                }
            })
        },

        /**
         * Aborts a running cronjob. Scripts that run without workerThread cannot
         * really be stopped, in that case only the lock and the execution entry are released.
         */
        abortCronJob: async ({cronjobId, reason}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)

            let cronJob
            if (ObjectId.isValid(cronjobId)) {
                cronJob = await db.collection('CronJob').findOne({_id: new ObjectId(cronjobId)})
            }

            if (!userHasAccessToObject(context, cronJob)) {
                // throw an error if the user has no access to abort this cronjob
                await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_OTHER_USERS)
            }

            const finalReason = reason || `Cronjob was aborted manually by user ${context.id}`
            const success = cronjobUtil.abortCronJob(cronjobId, finalReason)

            return {
                success,
                status: success ? `Cronjob ${cronjobId} was aborted` : `Cronjob ${cronjobId} is not running`
            }
        }
    }
})