export const systemSchemaRaw = `
    type RunResult { 
        response: String
        error: String
        event: String
        id: String
    }
    
    type MailResult { 
        response: String
    }
    
    type PingResult { 
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
    
    type Collection {
        name: String
    }
    
    type CloneCollectionResult{
        status: String,
        collection: Collection
    } 
    
    type DeleteCollectionResult{
        status: String,
        collection: Collection
    }
    
    type CollectionResult {
        results: [Collection]
        offset: Int
        limit: Int
        total: Int
    }
    
    type BrokenReferencesResult {
        total: Int
    }
        
        
    type CollectionAggregateResult {
        result: String
    }
        
    type ImportCollectionResult {
        result: String
    }
        
    type Query {
        brokenReferences(type: String!, field: String): BrokenReferencesResult
    	run(command: String!, scope: String, id: String, sync: Boolean): RunResult
    	killRun(id: String!): RunResult
    	sendMail(recipient: String!, subject: String, body: String, slug: String): MailResult
    	dbDumps: DbDumpResult   
    	mediaDumps: MediaDumpResult  
    	ping: PingResult
    	collections (filter: String): CollectionResult
    	collectionAggregate (collection: String!, json: String!): CollectionAggregateResult
    	importCollection (collection: String!, json: String!): ImportCollectionResult
    }
    
      
    type Mutation {   	
    	createDbDump(type: String): DbDump
    	createMediaDump(type: String): MediaDump
    	cloneCollection(type: String!, name: String): CloneCollectionResult
    	deleteCollection(name: String!): DeleteCollectionResult
    }
    
    type Subscription{
        subscribeRun: RunResult
    }
`
