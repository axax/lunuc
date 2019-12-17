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
        lastLogin: Float
        username: String!
        password: String!
        email: String!
        emailConfirmed: Boolean!
        note: [Note]
        meta: String
        role: UserRole
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
	
	type ForgotPasswordResult {
		status: String
	}
	type NewPasswordResult {
		status: String
	}
	
	type ConfirmEmailResult {
		status: String
	}
	
    type Query {
        users(limit: Int=10, page: Int, offset: Int=0, sort: String, filter: String): UserResult
        userRoles(limit: Int=10, page: Int, offset: Int=0, sort: String, filter: String): UserRoleResult
        
        
        publicUsers(limit: Int=10, offset: Int=0): [UserPublic]
        
        me: User
        login(username: String!, password: String!): Token
        forgotPassword(username: String!, url: String!): ForgotPasswordResult
        newPassword(token:String!, password:String!, passwordConfirm:String): NewPasswordResult
        confirmEmail(token:String!): ConfirmEmailResult
        sendConformationEmail(mailTemplate: String!, mailSubject: String!, mailUrl: String!): ConfirmEmailResult
    }
		
	type Mutation {
	
	    signUp(
			email: String!
			username: String!
			password: String!
			mailTemplate: String
			mailSubject: String
			mailUrl: String
            role: ID
		): Token
		
		createUser (
			email: String!
			username: String!
			password: String!
			emailConfirmed: Boolean
            role: ID
		): User
		
		updateUser (
		    _id: ID!
			email: String
			username: String
			password: String
			emailConfirmed: Boolean
            role: ID
		): User
		
		updateUserRole (
		    _id: ID!
			name: String
			capabilities: [String]
		): UserRole
		
    	deleteUser(_id: ID!): User
	    deleteUsers (_id:[ID]):[User]

    	deleteUserRole(_id: ID!): UserRole
	    deleteUserRoles (_id:[ID]):[UserRole]

						
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
