export const keyvalueSchemaRaw = `

    type KeyValue {
		_id: ID!
		key: String!
		value: String
        createdBy: UserPublic
        status: String
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
		setKeyValue(key: String!, value: String): KeyValue	
		createKeyValue(key: String!, value: String, createdBy: ID!): KeyValue	
		deleteKeyValue(key: String!): KeyValue
		
		
		createKeyValueGlobals (key: String!, value: String): KeyValue
	}
`