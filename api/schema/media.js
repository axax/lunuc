export const mediaSchemaRaw = `


    type MediaGroup {
        _id: ID! 
        createdBy: UserPublic!
        name: String
        status: String 
    }
    
    type Media {
        _id: ID! 
        createdBy: UserPublic!
        status: String
        name: String 
        src: String 
        mimeType: String 
	    group:[MediaGroup]
    }
    
    
    type MediaResult {
        results: [Media]
        offset: Int
        limit: Int
        total: Int
    }
    
    type MediaGroupResult {
        results: [MediaGroup]
        offset: Int
        limit: Int
        total: Int
    }
    
    type Query {
    	medias(limit: Int=10, offset: Int=0, page: Int=0, sort: String, filter: String): MediaResult
    	mediaGroups(limit: Int=10, offset: Int=0, page: Int=0, sort: String, filter: String): MediaGroupResult
    }
    		
	type Mutation {
		createMedia(name: String, src: String, mimeType: String,group:[ID]): Media
		updateMedia(_id: ID!, name: String, src: String, mimeType: String,group:[ID]): Media	
		deleteMedia(_id: ID!): Media
		createMediaGroup(name: String): MediaGroup
		updateMediaGroup(_id: ID!, name: String): MediaGroup
		deleteMediaGroup(_id: ID!): MediaGroup
	}
`