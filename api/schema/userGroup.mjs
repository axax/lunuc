export const userGroupSchemaRaw = `
   
	    
    type UserGroup {
		_id: ID!
		status: String
        modifiedAt: Float
        name: String!
        createdBy: UserPublic
    }
    
    type UserGroupResult {
        results: [UserGroup]
        offset: Int
        limit: Int
        total: Int
        meta: String
    }
    
    type Query {
        userGroups(limit: Int=10, page: Int, offset: Int=0, sort: String, filter: String): UserGroupResult
    }
		
	type Mutation {
	
			
		createUserGroup (
			name: String!
			createdBy: ID
		): UserGroup
		
		updateUserGroup (
		    _id: ID!
			name: String
			createdBy: ID
		): UserGroup
				
    	deleteUserGroup(_id: ID!): UserGroup
	    deleteUserGroups (_id:[ID]):[UserGroup]
	}
`
