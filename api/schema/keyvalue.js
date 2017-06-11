// a trailling ! = required (must not be null)
export const keyvalueSchemaRaw = `
  
	type KeyValue {
		_id: ID!
		key: String!
		value: String
	}
		
  type Query {
    keyvalue(key: String): [KeyValue]
    keyvalueOne(key: String!): KeyValue
  }
		
	# this schema allows the following mutation:
	type Mutation {
		setValue (
			key: String!
			value: String
		): KeyValue		
	}
	
	schema {
		query: Query
		mutation: Mutation
		subscription: Subscription
	}
`

