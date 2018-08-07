export const keyvalueSchemaRaw = `

    type KeyValue {
		_id: ID!
		key: String!
		value: String
        createdBy: UserPublic
        status: String
        ispublic: Boolean
	}
    
    type KeyValueResult {
        results: [KeyValue]
        offset: Int
        limit: Int
        total: Int
    }
    
    type Query {
    	keyValues(limit: Int=10, page: Int, offset: Int=0, sort: String, filter: String, keys: [String], all: Boolean): KeyValueResult
    	keyValueGlobals(limit: Int=10, page: Int, offset: Int=0, sort: String, filter: String, keys: [String]): KeyValueResult
    	keyValue(key: String!): KeyValue
    }
    
		
	type Mutation {
		createKeyValue(key: String!, value: String, createdBy: ID!): KeyValue	
		updateKeyValue(_id: ID!, key: String, value: String, createdBy: ID): KeyValue
		deleteKeyValue(_id: ID!): KeyValue
		
		setKeyValue(key: String!, value: String): KeyValue	
		deleteKeyValueByKey(key: String!): KeyValue
		
		
		createKeyValueGlobal(key: String!, value: String, ispublic: Boolean): KeyValue
		updateKeyValueGlobal(_id: ID!, key: String, value: String, ispublic: Boolean): KeyValue
		deleteKeyValueGlobal(_id: ID!): KeyValue
	}
`