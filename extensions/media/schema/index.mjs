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


    type DeletedMedia{
        _id: ID
        name: String
        mimeType: String
        size: Float
        deletedAt: Float
        deletedBy: String
        inTrash: Boolean
    }

    type DeletedMediaResult{
        results: [DeletedMedia]
        hasMore: Boolean
    }

    type RestoreMediaResult{
        _id: ID
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
        # admins only: deletes media even if they are still used somewhere
        forceDeleteMedia(_id: [ID]!): [MediaStatus]
        # admins only: restores deleted media from the History, the file from the trash (if still there)
        restoreMedia(_id: [ID]!): [RestoreMediaResult]
    }

    type Query {
    	cleanUpMedia(ids:[String]): CleanUpMediaResult
        # admins only: deleted media (newest first) that can be restored
        deletedMedia(limit: Int, offset: Int, search: String): DeletedMediaResult
    	findReferencesForMedia(limit: String, ids:[ID]): FindReferencesForMediaResult
        deleteOnlyMediaFiles (_id:[ID]):[MediaStatus]
        sendAsAttachment(_id:[ID],email:String):[MediaStatus]
    }
`
