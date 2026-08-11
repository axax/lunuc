export default `

    type RunScriptResult {
        status: String
        result: String
    }
    
    type TestExecFilterResult {
        match: Boolean
    }
    
    type RunningCronJob {
        cronjobId: String
        executionId: String
        name: String
        startTime: Float
        runtime: Float
        killable: Boolean
    }
    
    type AbortCronJobResult {
        success: Boolean
        status: String
    }
    
    type Query {
        runCronJob(cronjobId: String, script: String, scriptLanguage: String, sync: Boolean, noEntry: Boolean, workerThread: Boolean, meta: String): RunScriptResult
        testExecFilter(filter: String!): TestExecFilterResult
        getRunningCronJobs: [RunningCronJob]
        abortCronJob(cronjobId: String!, reason: String): AbortCronJobResult
    }
`