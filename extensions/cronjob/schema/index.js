export default `

    type RunScriptResult {
        status: String
        result: String
    }
    
    type TestExecFilterResult {
        match: Boolean
    }
    
    type Query {
    	runCronJob(cronjobId: String, script: String, scriptLanguage: String, sync: Boolean, noEntry: Boolean): RunScriptResult
    	testExecFilter(filter: String!): TestExecFilterResult
    }
`
