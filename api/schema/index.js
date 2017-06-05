import {buildSchema} from 'graphql'
import { mergeStrings } from 'gql-merge'
import {userSchemaRaw} from './user'
import {notificationSchemaRaw} from './notification'
import {chatSchemaRaw} from './chat'

// a trailling ! = required (must not be null)
const schemaRaw = `
  
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



// Construct a schema, using GraphQL schema language
export const schema = buildSchema( mergeStrings([schemaRaw,userSchemaRaw,notificationSchemaRaw,chatSchemaRaw]) )