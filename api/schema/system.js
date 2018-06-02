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
    
    type MediaDump {
        name: String
        createdAt: Float
        size: String
    }
    
    type MediaDumpResult {
        results: [MediaDump]
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
    	mediaDumps: MediaDumpResult   
    }
    
      
    type Mutation {   	
    	createDbDump(type: String): DbDump
    	createMediaDump(type: String): MediaDump
    }
`