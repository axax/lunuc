export default `

    type TestJobResult {
        status: String
    }
    
    type RunScriptResult {
        status: String
        result: String
    }
    
    type TestExecFilterResult {
        match: Boolean
    }
    
    type Query {
    	runScript(script: String, scriptLanguage: String): RunScriptResult
    	testJob(cronjobId: String!, script: String, scriptLanguage: String): TestJobResult
    	testExecFilter(filter: String!): TestExecFilterResult
    }
`
