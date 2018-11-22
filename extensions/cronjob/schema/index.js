export default `

    type TestJobResult {
        status: String
    }
    
    type Query {
    	testJob(script: String): TestJobResult
    }
`