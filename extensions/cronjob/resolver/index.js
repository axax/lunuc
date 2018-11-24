import cronjobUtil from '../cronjobUtil'

export default db => ({
    testJob: async ({script, cronjobId}, {context}) => {
        const id = await cronjobUtil.runScript({cronjobId, script, context, db})
        return {status: `Job started. CronJobExecution id is ${id}`}
    }
})
