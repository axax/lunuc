export const keyvalueSchemaRaw = `

    type KeyValue {
		_id: ID!
		key: String!
		value: String
        createdBy: UserPublic
        status: String
	}
	
    type KeyValueGlobal {
		_id: ID!
		key: String!
		value: String
        createdBy: UserPublic
        ownerGroup:[UserGroup]
        status: String
        ispublic: Boolean
	}
    
    type KeyValueResult {
        results: [KeyValue]
        offset: Int
        limit: Int
        total: Int
        meta: String
    }
    
    type KeyValueGlobalResult {
        results: [KeyValueGlobal]
        offset: Int
        limit: Int
        total: Int
        meta: String
    }
    
    type Query {
    	keyValues(user: String, limit: Int=10, page: Int, offset: Int=0, sort: String, filter: String, keys: [String], global: Boolean, all: Boolean): KeyValueResult
    	keyValue(user: String, key: String!): KeyValue
    	
    	keyValueGlobals(limit: Int=10, page: Int, offset: Int=0, sort: String, filter: String, keys: [String]): KeyValueGlobalResult
    }
    
    type KeyValueGlobalSubscribeResult {
        data:[KeyValueGlobal]
        keys:String
        action:String
    }
    
    type Subscription{
        subscribeKeyValueGlobal(keys:String): KeyValueGlobalSubscribeResult
    }
    
	type Mutation {
		createKeyValue(key: String!, value: String, createdBy: ID): KeyValue	
		updateKeyValue(_id: ID!, key: String, value: String, createdBy: ID): KeyValue
		deleteKeyValue(_id: ID!): KeyValue
		deleteKeyValues(_id: [ID]): [KeyValue]
		setKeyValue(key: String!, value: String): KeyValue	
		deleteKeyValueByKey(key: String!): KeyValue
		cloneKeyValue(_id:ID!,key:String!):KeyValue
		
		createKeyValueGlobal(key: String!, value: String, ispublic: Boolean, ownerGroup:[ID]): KeyValueGlobal
		updateKeyValueGlobal(_id: ID!, createdBy: ID, key: String, value: String, ispublic: Boolean, ownerGroup:[ID]): KeyValueGlobal
		deleteKeyValueGlobal(_id: ID!): KeyValueGlobal
		deleteKeyValueGlobals(_id: [ID]): [KeyValueGlobal]
        setKeyValueGlobal(key: String!, value: String): KeyValueGlobal	
        
        
	    cloneKeyValueGlobal(_id:ID!,key:String!):KeyValueGlobal

	}
`
