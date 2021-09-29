export const userGroupSchemaRaw = `
   
	    
    type UserGroup {
		_id: ID!
		status: String
        modifiedAt: Float
        name: String!
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
		): UserGroup
		
		updateUserGroup (
		    _id: ID!
			name: String
		): UserGroup
				
    	deleteUserGroup(_id: ID!): UserGroup
	    deleteUserGroups (_id:[ID]):[UserGroup]
	}
`
