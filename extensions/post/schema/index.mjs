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
        editor: String
        status: String
        search: PostSearch
        searchScore: Float
    }
    
    type PostResult {
        results: [Post]
        offset:Int
        limit:Int
        total:Int
        meta:String
    }
    
        
    type Query {
    	posts(sort: String, limit: Int=10, page: Int, offset: Int=0, query: String, filter: String): PostResult
    }

	type Mutation {
		createPost (
			title: String!
			body: String
			editor: String
		): Post
		updatePost(_id: ID!, createdBy:ID, title: String, body: String, editor: String): Post	
		deletePost(_id: ID!): Post
	}
	
type PostSubscribeResult {
	data:Post
	action:String
}

type Subscription{
    subscribePost: PostSubscribeResult
}
`
