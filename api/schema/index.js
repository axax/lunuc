import {buildSchema} from 'graphql'
import { mergeStrings } from 'gql-merge'
import {commonSchemaRaw} from './common'
import {keyvalueSchemaRaw} from './keyvalue'
import {userSchemaRaw} from './user'
import {notificationSchemaRaw} from './notification'
import {chatSchemaRaw} from './chat'


// Construct a schema, using GraphQL schema language
export const schema = buildSchema( mergeStrings([commonSchemaRaw,keyvalueSchemaRaw,userSchemaRaw,notificationSchemaRaw,chatSchemaRaw]) )