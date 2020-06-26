export default `


    type CleanUpMediaResult{
        status: String
    }
    
    type FindReferencesForMediaResult{
        status: String
    }


    type Query {
    	cleanUpMedia: CleanUpMediaResult
    	findReferencesForMedia: FindReferencesForMediaResult
    }
    
`
