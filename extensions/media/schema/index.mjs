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


    type MediaGroupCopyResult{
        _id: ID
        name: String
        parent: ID
        count: Int
    }

    type Mutation {
        # copies a folder with all its subfolders (new groups). Media files are NOT linked to the copy
        copyMediaGroupStructure(_id: ID!, name: String): MediaGroupCopyResult
    }

    type Query {
    	cleanUpMedia(ids:[String]): CleanUpMediaResult
    	findReferencesForMedia(limit: String, ids:[ID]): FindReferencesForMediaResult
        deleteOnlyMediaFiles (_id:[ID]):[MediaStatus]
        sendAsAttachment(_id:[ID],email:String):[MediaStatus]
    }
`
