import {buildSchema} from 'graphql'

// a trailling ! = required (must not be null)
const schemaRaw = `

	type User {
    id: ID!
    username: String!
  }
  
	type keyvalue {
		id: String!
		key: String!
		value: String
	}
	
	
  type Query {
    keyvalue: [keyvalue]
    value(key: String!): String
    me: User
  }
		
	# this schema allows the following mutation:
	type Mutation {
		setValue (
			id: String
			key: String!
			value: String
		): keyvalue
	}
`



// Construct a schema, using GraphQL schema language
export const schema = buildSchema(schemaRaw)