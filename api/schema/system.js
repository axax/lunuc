export const systemSchemaRaw = `
    type RunResult { 
        response: String
    }
    
    type DbDump {
        name: String
        createdAt: Float
        size: String
    }
    
    type DbDumpResult {
        results: [DbDump]
        offset: Int
        limit: Int
        total: Int
    }
    
    type BrokenReferencesResult {
        total: Int
    }
        
    type Query {
        brokenReferences(type: String!, field: String): BrokenReferencesResult
    	run(command: String!): RunResult
    	dbDumps: DbDumpResult   
    }
    
      
    type Mutation {   	
    	createDbDump(type: String): DbDump
    }
`