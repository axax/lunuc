import { mergeTypeDefs} from '@graphql-tools/merge'

import Hook from '../../util/hook.cjs'

import gensrcSchemaRaw from '../../gensrc/schema.mjs'
import {commonSchemaRaw} from './common.mjs'
import {keyvalueSchemaRaw} from './keyvalue.mjs'
import {userSchemaRaw} from './user.mjs'
import {userGroupSchemaRaw} from './userGroup.mjs'
import {notificationSchemaRaw} from './notification.mjs'
import {systemSchemaRaw} from './system.mjs'
import {filesSchemaRaw} from './files.mjs'

const schemas = [gensrcSchemaRaw,commonSchemaRaw,keyvalueSchemaRaw,userGroupSchemaRaw,userSchemaRaw,notificationSchemaRaw,systemSchemaRaw,filesSchemaRaw]

Hook.call('schema', {schemas})

export const schemaString = mergeTypeDefs(schemas)
