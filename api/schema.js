import {buildSchema} from 'graphql'

// a trailling ! = required (must not be null)
const schemaRaw = `

	type User {
	_id: ID!
		objectId: ID!
    username: String!
    password: String!
    email: String!
  }
  
	type KeyValue {
		objectId: ID!
		key: String!
		value: String
	}
	
	
  type Query {
    keyvalue(key: String): [KeyValue]
    keyvalueOne(key: String!): KeyValue
    me: User
  }
		
	# this schema allows the following mutation:
	type Mutation {
		setValue (
			key: String!
			value: String
		): KeyValue		
		
		createUser (
			email: String!
			username: String!
			password: String!
		): User
	}
`



// Construct a schema, using GraphQL schema language
export const schema = buildSchema(schemaRaw)