export default `

    type TestJobResult {
        status: String
    }
    
    type Query {
    	testJob(cronjobId: String!, script: String): TestJobResult
    }
`