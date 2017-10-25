export const postSchemaRaw = `
    type Post {
        _id: ID! # unique id for words
        createdBy: UserPublic! # id of user
        subject: String!
        content: String
        status: String
    }
    
    
    type Query {
    	posts(limit: Int=10, offset: Int=0): [Post]
    }
    
		
	type Mutation {
		createPost (
			subject: String!
			content: String
		): Post
		updatePost(_id: ID!, subject: String, content: String): Post	
		deletePost(id: ID!): Post
	}
`