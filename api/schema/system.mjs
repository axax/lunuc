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
    
    type Backup {
        name: String
        createdAt: Float
        size: String
    }
    
    type BackupResult {
        results: [Backup]
        offset: Int
        limit: Int
        total: Int
    }
    
    type RemoveBackupResult {
        status: String
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
        
    type BulkEditResult {
        result: String
    }
    
    type ExportQueryResult {
        result: String
    }
    
    type SearchInCollections{
        collection: String
        field: String
    }
    
    type SearchInCollectionsResult{
        results: [SearchInCollections]
    }
        
    type Query {
        searchInCollections(search: String!): SearchInCollectionsResult
        brokenReferences(type: String!, field: String): BrokenReferencesResult
    	run(command: String!, scope: String, id: String, sync: Boolean): RunResult
    	killRun(id: String!): RunResult
    	sendMail(recipient: String!, subject: String, body: String, slug: String, from: String, replyTo: String): MailResult
    	backups(type: String!): BackupResult
    	ping: PingResult
    	collections (filter: String): CollectionResult
    	collectionAggregate (collection: String!, json: String!): CollectionAggregateResult
    	importCollection (collection: String!, json: String!): ImportCollectionResult
    	bulkEdit (collection: String!, _id: [ID]!, script: String!): BulkEditResult,
    	exportQuery (type: String!, query: String): ExportQueryResult
    }
    
      
    type Mutation {   	
    	createBackup(type: String!): Backup    	
    	removeBackup(type: String!, name: String!): RemoveBackupResult   
    	cloneCollection(type: String!, name: String): CloneCollectionResult
    	deleteCollection(name: String!): DeleteCollectionResult
    }
    
    type Subscription{
        subscribeRun: RunResult
    }
`