import {buildSchema} from 'graphql'
import { mergeStrings } from 'gql-merge'
import Hook from '../../util/hook'

import {commonSchemaRaw} from './common'
import {keyvalueSchemaRaw} from './keyvalue'
import {userSchemaRaw} from './user'
import {notificationSchemaRaw} from './notification'
import {cmsSchemaRaw} from './cms'
import {systemSchemaRaw} from './system'

const schemas = [commonSchemaRaw,keyvalueSchemaRaw,userSchemaRaw,notificationSchemaRaw,cmsSchemaRaw,systemSchemaRaw]

Hook.call('schema', {schemas})


// Construct a schema, using GraphQL schema language
export const schema = buildSchema( mergeStrings(schemas) )