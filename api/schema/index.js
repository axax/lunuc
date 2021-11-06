import { mergeTypeDefs} from '@graphql-tools/merge'

import Hook from '../../util/hook'

import gensrcSchemaRaw from 'gensrc/schema'
import {commonSchemaRaw} from './common'
import {keyvalueSchemaRaw} from './keyvalue'
import {userSchemaRaw} from './user'
import {userGroupSchemaRaw} from './userGroup'
import {notificationSchemaRaw} from './notification'
import {systemSchemaRaw} from './system'

const schemas = [gensrcSchemaRaw,commonSchemaRaw,keyvalueSchemaRaw,userGroupSchemaRaw,userSchemaRaw,notificationSchemaRaw,systemSchemaRaw]

Hook.call('schema', {schemas})

export const schemaString = mergeTypeDefs(schemas)
