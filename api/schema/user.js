export const userSchemaRaw = `

	type UserRole {
		_id: ID!
        name: String!
        capabilities: [String]!
    }
    
	type UserSettings {
		speechLang: SingleSelection!
    }
    
	input UserSettingsInput {
		speechLang: String
    }
  
	type User {
		_id: ID!
        username: String!
        password: String!
        email: String!
        emailConfirmed: Boolean!
        note: [Note]
        role: UserRole!
        settings: UserSettings!
    }
  
	type UserPublic  {
		_id: ID!
        username: String!
    }
	
	type Note {
		_id: ID!
		value: String!
		firstline: String!
	}
	
	type Token {
		token: String
		error: String
	}
	
    type Query {
        me: User
        login(username: String!, password: String!): Token,
        users(limit: Int=10, offset: Int=0): [UserPublic]
    }
		
	type Mutation {
		createUser (
			email: String!
			username: String!
			password: String!
			settings: UserSettingsInput
		): User
						
		updateMe (
			email: String
			username: String
			settings: UserSettingsInput
		): User
		
		updateNote (
			_id: ID!
			value: String
		): Note
		
		deleteNote (
			_id: ID!
		): Note
		
		createNote(value: String): Note
	}
`