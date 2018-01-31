export const mediaSchemaRaw = `
    type Media {
        _id: ID! 
        createdBy: UserPublic!
        name: String 
        src: String 
        mimeType: String 
        status: String 
    }
    
    
    type MediaResult {
        results: [Media]
        offset: Int
        limit: Int
        total: Int
    }
    
    type Query {
    	medias(limit: Int=10, offset: Int=0, page: Int=0, sort: String, filter: String): MediaResult
    }
    
		
	type Mutation {
		createMedia(name: String, src: String): Media
		updateMedia(_id: ID!, name: String, src: String): Media	
		deleteMedia(_id: ID!): Media
	}
`