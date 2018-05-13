export const userSchemaRaw = `

	type UserRole {
		_id: ID!
		status: String
        name: String!
        capabilities: [String]!
    }
  
    type UserRoleResult {
        results: [UserRole]
        offset: Int
        limit: Int
        total: Int
    }
    
	type User {
		_id: ID!
		status: String
        modifiedAt: Float
        username: String!
        password: String!
        email: String!
        emailConfirmed: Boolean!
        note: [Note]
        role: UserRole!
    }
    
    type UserResult {
        results: [User]
        offset: Int
        limit: Int
        total: Int
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
		user: User
	}
	
    type Query {
        users(limit: Int=10, page: Int, offset: Int=0, sort: String, filter: String): UserResult
        userRoles(limit: Int=10, page: Int, offset: Int=0, sort: String, filter: String): UserRoleResult
        
        
        publicUsers(limit: Int=10, offset: Int=0): [UserPublic]
        
        me: User
        login(username: String!, password: String!): Token
    }
		
	type Mutation {
		createUser (
			email: String!
			username: String!
			password: String!
            role: ID
		): User
		
		updateUser (
		    _id: ID!
			email: String
			username: String
			password: String
            role: ID
		): User
		
    	deleteUser(_id: ID!): User

						
		updateMe (
			email: String
			username: String
			password: String
            role: ID
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