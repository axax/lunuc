export default `
    type PostSearch {
        headerOne: String
        headerTwo: String
        headerThree: String
        headerFour: String
        headerFive: String
        headerSix: String
        blockquote: String
        codeBlock: String
        orderedListItem: String
        styleBold: String
        styleCode: String
        styleItalic: String
        styleUnderline: String
        unorderedListItem: String
        unstyled: String
    }
    
    type Post {
        _id: ID! # unique id for words
        createdBy: UserPublic! # id of user
        title: String!
        body: String
        status: String
        search: PostSearch
        searchScore: Float
    }
    
    
    type Query {
    	posts(limit: Int=10, offset: Int=0, query: String): [Post]
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