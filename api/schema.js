import {buildSchema} from 'graphql'

// a trailling ! = required (must not be null)
const schemaRaw = `

	type User {
		_id: ID!
    username: String!
    password: String!
    email: String!
    note: [Note]
  }
  
	type KeyValue {
		_id: ID!
		key: String!
		value: String
	}
	
	type Note {
		_id: ID!
		value: String!
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
		
		setNote (
			_id: ID
			value: String
		): Note
		
	}
`



// Construct a schema, using GraphQL schema language
export const schema = buildSchema(schemaRaw)