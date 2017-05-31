
export const userSchemaRaw = `
	type User {
		_id: ID!
    username: String!
    password: String!
    email: String!
    emailConfirmed: Boolean!
    note: [Note]
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
    login(username: String!, password: String!): Token
  }
		
	type Mutation {
		createUser (
			email: String!
			username: String!
			password: String!
		): User
						
		updateMe (
			email: String
			username: String
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