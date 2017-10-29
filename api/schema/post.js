export const postSchemaRaw = `
    type Post {
        _id: ID! # unique id for words
        createdBy: UserPublic! # id of user
        title: String!
        body: String
        status: String
    }
    
    
    type Query {
    	posts(limit: Int=10, offset: Int=0): [Post]
    }
    
		
	type Mutation {
		createPost (
			title: String!
			body: String
		): Post
		updatePost(_id: ID!, title: String, body: String): Post	
		deletePost(_id: ID!): Post
	}
`