
export const userSchemaRaw = `
	type User {
		_id: ID!
    username: String!
    password: String!
    email: String!
    note: [Note]
  }
	
	type Note {
		_id: ID!
		value: String!
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
						
		changeMe (
			email: String
			username: String
		): User
		
		setNote (
			_id: ID
			value: String
		): Note
		
	}
`