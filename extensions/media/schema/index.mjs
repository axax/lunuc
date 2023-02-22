export default `
    type LocalizedMedia {
        de: [Media]
        en: [Media]
        fr: [Media]
        it: [Media]
    }

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
