export default `

    type TestJobResult {
        status: String
    }
    
    type TestExecFilterResult {
        match: Boolean
    }
    
    type Query {
    	testJob(cronjobId: String!, script: String): TestJobResult
    	testExecFilter(filter: String!): TestExecFilterResult
    }
`