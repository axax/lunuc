export default `
    type Word {
        _id: ID! # unique id for words
        createdBy: UserPublic! # id of user
        en: String
        de: String
        categories: [WordCategory]    
        status: String
    }
    
    type Translation {
        text: String,
        fromIso: String,
        toIso: String
    }
    
    type WordCategory {
        _id: ID! # unique id for category
        createdBy: UserPublic! # id of user
        en: String
        de: String
    }
    
    type WordResult {
        results: [Word]
        offset: Int
        limit: Int
        total: Int
    }
    
    type Query {
    	words(sort: String, limit: Int=10, page: Int=0, offset: Int=0, filter: String): WordResult
    	translate(text: String!, toIso: String!, fromIso: String): Translation
    }
    
		
	type Mutation {
		createWord (
			en: String
			de: String
		): Word
		updateWord(_id: ID!, en: String, de: String): Word	
		deleteWord(_id: ID!): Word
	}
`