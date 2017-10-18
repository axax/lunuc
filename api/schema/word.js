export const wordSchemaRaw = `
    type Word {
        _id: ID! # unique id for words
        createdBy: UserPublic! # id of user
        en: String!
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
        en: String!
        de: String
    }
    
    type Query {
    	words(limit: Int=10, offset: Int=0): [Word]
    	translate(text: String, toIso: String): Translation
    }
    
    
		
	type Mutation {
		createWord (
			en: String!
			de: String
		): Word
		updateWord(id: ID!, en: String, de: String): Word	
		deleteWord(id: ID!): Word
	}
`