export const userSchemaRaw = `
   
	
  
	type UserSetting {
		_id: ID!
		status: String
        name: String!
        createdBy: UserPublic
    }
    
    type UserSettingResult {
        results: [UserSetting]
        offset: Int
        limit: Int
        total: Int
        meta: String
    }
  
    type UserRole {
		_id: ID!
		status: String
        name: String!
        prettyName: LocalizedString
        capabilities: [String]!
        ownerGroup:[UserGroup]
    }
    
    type UserRoleResult {
        results: [UserRole]
        offset: Int
        limit: Int
        total: Int
        meta: String
    }
    
	type User {
		_id: ID!
		status: String
        modifiedAt: Float
        lastLogin: Float
        lastActive: Float
        username: String!
        password: String
        email: String!
        emailConfirmed: Boolean!
        blocked: Boolean
        requestNewPassword: Boolean
        picture: Media
        note: [Note]
        meta: String
        domain: String
        signupToken: String
        language: String
        role: UserRole
        junior: [User]
        group: [UserGroup]
        setting: [UserSetting]
    }
    
    type UserResult {
        results: [User]
        offset: Int
        limit: Int
        total: Int
        meta: String
    }
  
	type UserPublic  {
		_id: ID!
        username: String!
        picture: ID
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
	
	type LogoutResult {
		status: String
	}
	type SetInitialPasswordResult {
		status: String
	}
    type Query {
        users(limit: Int=10, page: Int, offset: Int=0, sort: String, filter: String): UserResult
        userRoles(limit: Int=10, page: Int, offset: Int=0, sort: String, filter: String): UserRoleResult      
        userSettings(limit: Int=10, page: Int, offset: Int=0, sort: String, filter: String): UserSettingResult      
        publicUsers(limit: Int=10, offset: Int=0): [UserPublic]
        me: User
        login(username: String!, password: String!, domain: String): Token
        logout: LogoutResult
        forgotPassword(username: String!,domain: String, url: String!, subject: String, fromEmail: String, fromName: String): ForgotPasswordResult
        newPassword(token:String!, password:String!, passwordConfirm:String): NewPasswordResult
        confirmEmail(token:String!): ConfirmEmailResult
        sendConformationEmail(mailTemplate: String!, mailSubject: String!, mailUrl: String!,fromEmail: String,fromName: String,replyTo: String): ConfirmEmailResult
        setInitalPassword(ids:[ID],url:String,fromName:String): SetInitialPasswordResult
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
            domain: String
            fromEmail: String
            fromName: String
            replyTo: String
		): Token
		
			
		createUser (
			email: String!
			username: String!
			password: String
			picture: ID
			emailConfirmed: Boolean
			blocked: Boolean
			requestNewPassword: Boolean
            role: ID
            meta: String
            domain: String
            language: String
            junior: [ID]
            group: [ID]
            setting: [ID]
		): User
		
		
		createUserRole (
			name: String
			prettyName: LocalizedStringInput,
			capabilities: [String],
			ownerGroup:[ID]
		): UserRole
		
		
		createUserSetting (
			name: String
		): UserSetting
		
		updateUser (
		    _id: ID!
			email: String
			username: String
			picture: ID
			password: String
            language: String
			emailConfirmed: Boolean
			blocked: Boolean
			requestNewPassword: Boolean
            role: ID
            meta: String
            domain: String
            junior: [ID]
            group: [ID]
            setting: [ID]
		): User
		
		updateUserRole (
		    _id: ID!
			name: String
			prettyName: LocalizedStringInput,
			capabilities: [String]
			ownerGroup:[ID]
		): UserRole
		
		
		updateUserSetting (
		    _id: ID!
			name: String
			createdBy: ID
		): UserSetting
		
		
    	deleteUser(_id: ID!): User
	    deleteUsers (_id:[ID]):[User]

    	deleteUserRole(_id: ID!): UserRole
	    deleteUserRoles (_id:[ID]):[UserRole]

					
    	deleteUserSetting(_id: ID!): UserSetting
	    deleteUserSettings (_id:[ID]):[UserSetting]
	
		updateMe (
			email: String
			username: String
			password: String
			passwordConfirm:String
			picture: ID
            role: ID
            language: String
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
