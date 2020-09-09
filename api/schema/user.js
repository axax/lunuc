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
        requestNewPassword: Boolean
        picture: Media
        note: [Note]
        meta: String
        signupToken: String
        role: UserRole
        junior: [User]
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
		resetToken: String
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
        forgotPassword(username: String!, url: String!, subject: String): ForgotPasswordResult
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
            meta: String
            role: ID
		): Token
		
			
		createUser (
			email: String!
			username: String!
			password: String!
			picture: ID
			emailConfirmed: Boolean
			requestNewPassword: Boolean
            role: ID
            meta: String
            junior: [ID]
		): User
		
		updateUser (
		    _id: ID!
			email: String
			username: String
			picture: ID
			password: String
			emailConfirmed: Boolean
			requestNewPassword: Boolean
            role: ID
            meta: String
            junior: [ID]
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
			picture: ID
            role: ID
            meta: String
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
