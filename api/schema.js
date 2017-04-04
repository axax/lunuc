import {buildSchema} from 'graphql'

// a trailling ! = required (must not be null)
const schemaRaw = `
	type keyvalue {
		id: String!
		key: String!
		value: String
	}
  type Query {
    keyvalue: [keyvalue]
    value(key: String!): String
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