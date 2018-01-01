export const keyvalueSchemaRaw = `

    type KeyValue {
		_id: ID!
		key: String!
		value: String
        createdBy: UserPublic!
        status: String
	}
    
    type KeyValueResult {
        results: [KeyValue]
        offset: Int
        limit: Int
        total: Int
    }
    
    type Query {
    	keyValues(keys: [String],limit: Int=10, offset: Int=0): KeyValueResult
    	keyValue(key: String!): KeyValue
    }
    
		
	type Mutation {
		setKeyValue(key: String!, value: String): KeyValue	
		deleteKeyValue(key: String!): KeyValue
	}
`