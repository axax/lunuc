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
        bytes: Float
        pending: Boolean
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
       
    type GenericResult {
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
       
    type CollectionSyncResult {
        result: String
    }
        
    type ImportCollectionResult {
        result: String
        created: Int
        updated: Int
        skipped: Int
        errors: [String]
    }
        
    type BulkEditResult {
        result: String
    }
    
    type SearchInCollections{
        collection: String
        field: String
    }
    
    type SearchInCollectionsResult{
        results: [SearchInCollections]
    }
    
    type CollectionIndexes{
        name: String
        totalIndexSize: Float
        indexes: [String]
    }
    
    type CollectionIndexResult{
        results: [CollectionIndexes]
    }
        
    type TokenLinkResult{
        token: String
    }
    
    type TypeFilesExport{
        name: String
        count: Int
        data: String
    }

    type TypeFilesSource{
        type: String
        folder: String
    }

    type TypeFilesImportResult{
        created: Int
        updated: Int
        unchanged: Int
        skipped: Int
        names: [String]
        errors: [String]
    }

    type SystemInfoResult{
        dbUrl: String
    }

    type SystemUpdateCommit{
        hash: String
        shortHash: String
        date: String
        author: String
        subject: String
    }

    type SystemUpdateInfo{
        branch: String
        upstream: String
        current: SystemUpdateCommit
        latest: SystemUpdateCommit
        currentVersion: String
        buildNumber: String
        latestVersion: String
        ahead: Int
        behind: Int
        commits: [SystemUpdateCommit]
        dirtyFiles: [String]
        dependenciesChanged: Boolean
        checkedAt: Float
        fetchError: String
        error: String
        runAs: String
        launcher: String
        cannotUpdateReason: String
    }

    type NodeRelease{
        major: Int
        version: String
        date: String
        lts: String
        security: Boolean
    }

    type NodeServiceVersion{
        name: String
        version: String
    }

    type NodeRuntimeInfo{
        version: String
        execPath: String
        nvmDir: String
        installed: [String]
        services: [NodeServiceVersion]
        releases: [NodeRelease]
        latest: String
        latestLts: String
        latestPatch: String
        fetchError: String
        cannotUpdateReason: String
    }

    type MongoRuntimeInfo{
        version: String
        packageVersion: String
        featureCompatibilityVersion: String
        series: String
        local: Boolean
        serviceActive: Boolean
        latest: String
        latestPatch: String
        nextSeries: String
        nextVersion: String
        error: String
        fetchError: String
        cannotUpdateReason: String
    }

    type SystemRuntimeInfo{
        node: NodeRuntimeInfo
        mongodb: MongoRuntimeInfo
        checkedAt: Float
    }

    type SystemUpdateStatus{
        running: Boolean
        task: String
        state: String
        restart: String
        force: Boolean
        exitCode: Int
        from: String
        to: String
        startedAt: String
        finishedAt: String
        log: String
    }
        
    type Query {
        systemInfo: SystemInfoResult
        systemUpdateInfo(fetch: Boolean): SystemUpdateInfo
        systemUpdateStatus: SystemUpdateStatus
        systemRuntimeInfo(fetch: Boolean): SystemRuntimeInfo
        searchInCollections(search: String!): SearchInCollectionsResult
        brokenReferences(type: String!, field: String): BrokenReferencesResult
    	run(command: String!, scope: String, id: String, sync: Boolean, timeout: Int): RunResult
    	killRun(id: String!): RunResult
    	sendMail(recipient: String!, subject: String, body: String, slug: String, from: String, replyTo: String): MailResult
    	backups(type: String!): BackupResult
    	ping: PingResult
    	collections (filter: String): CollectionResult
    	collectionAggregate (collection: String!, json: String!): CollectionAggregateResult
    	importCollection (collection: String!, json: String!, meta: String, dryRun: Boolean, createMissing: Boolean): ImportCollectionResult
    	bulkEdit (collection: String!, _id: [ID]!, data: String!, action: String): BulkEditResult
        getTokenLink(filePath:String,mediaIds: [ID]): TokenLinkResult
        getAllCollectionIndexes: CollectionIndexResult
        typeFilesTypes: [String]
        exportTypeFiles(type: String!, ids: [ID]!, aiGuide: Boolean): TypeFilesExport
        exportAllTypeFilesSources: [TypeFilesSource]
        exportAllTypeFiles(aiGuide: Boolean): TypeFilesExport
    }
    
      
    type Mutation {   	
    	createDbIndexes: GenericResult
    	ptyStart(id: String, cols: Int, rows: Int): RunResult
    	ptyWrite(id: String!, data: String!): RunResult
    	ptyResize(id: String!, cols: Int!, rows: Int!): RunResult
    	startSystemUpdate(restart: String, force: Boolean): SystemUpdateStatus
    	startNodeUpdate(version: String!): SystemUpdateStatus
    	startMongoUpdate(series: String!, backup: Boolean): SystemUpdateStatus
    	setMongoFeatureCompatibility(version: String!): GenericResult
    	dropDbIndexes(name: String!, indexes: [String]!): GenericResult   	
    	createBackup(type: String!, options: String): Backup    	
    	removeBackup(type: String!, name: String!): RemoveBackupResult   
    	cloneCollection(type: String!, name: String, empty: Boolean): CloneCollectionResult
    	deleteCollection(name: String!): DeleteCollectionResult
    	syncCollectionEntries(fromVersion:String!,toVersion:String!,type:String!,ids:[ID]!): CollectionSyncResult
    	importTypeFiles(type: String!, data: String!, dryRun: Boolean, createMissing: Boolean): TypeFilesImportResult
    	importAllTypeFiles(data: String!, dryRun: Boolean, createMissing: Boolean, exclude: [String]): TypeFilesImportResult
    }
    
    type Subscription{
        subscribeRun: RunResult
    }
`
