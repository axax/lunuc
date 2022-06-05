import {commonResolver} from './common.mjs'
import {userResolver} from './user.mjs'
import {userGroupResolver} from './userGroup.mjs'
import {notificationResolver} from './notification.mjs'
import {keyvalueResolver} from './keyvalue.mjs'
import {systemResolver} from './system.mjs'

import Hook from '../../util/hook.cjs'
import {deepMerge} from '../../util/deepMerge.mjs'

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
