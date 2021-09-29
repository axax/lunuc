import {commonResolver} from './common'
import {userResolver} from './user'
import {userGroupResolver} from './userGroup'
import {notificationResolver} from './notification'
import {keyvalueResolver} from './keyvalue'
import {systemResolver} from './system'

import Hook from '../../util/hook'
import {deepMerge} from 'util/deepMerge'

// The root provides a resolver function for each API endpoint
export const resolver = (db) => {

    // default core resolvers
    const resolvers =deepMerge({},
        commonResolver(db),
        userGroupResolver(db),
        userResolver(db),
        notificationResolver(db),
        keyvalueResolver(db),
        systemResolver(db)
    )

    Hook.call('resolver', {db, resolvers})
    return resolvers
}
