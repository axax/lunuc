import { mergeStrings } from 'gql-merge'
import Hook from '../../util/hook'

import gensrcSchemaRaw from 'gensrc/schema'
import {commonSchemaRaw} from './common'
import {keyvalueSchemaRaw} from './keyvalue'
import {userSchemaRaw} from './user'
import {notificationSchemaRaw} from './notification'
import {systemSchemaRaw} from './system'
import {mediaSchemaRaw} from './media'

const schemas = [gensrcSchemaRaw,commonSchemaRaw,keyvalueSchemaRaw,userSchemaRaw,notificationSchemaRaw,systemSchemaRaw,mediaSchemaRaw]

Hook.call('schema', {schemas})

export const schemaString = mergeStrings(schemas)