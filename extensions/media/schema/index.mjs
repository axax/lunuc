export default `


    type CleanUpMediaResult{
        status: String
    }
    
    type FindReferencesForMediaResult{
        status: String
    }


    type Query {
    	cleanUpMedia(ids:[String]): CleanUpMediaResult
    	findReferencesForMedia(limit: String): FindReferencesForMediaResult
    }
    
`
