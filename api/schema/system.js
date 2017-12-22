export const systemSchemaRaw = `
    type RunResult { 
        response: String
    }
        
    type Query {
    	run(command: String!): RunResult
    }
`