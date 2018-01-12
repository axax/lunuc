import {commonResolver} from './common'
import {userResolver} from './user'
import {notificationResolver} from './notification'
import {keyvalueResolver} from './keyvalue'
import {cmsResolver} from './cms'
import {systemResolver} from './system'
import {socialResolver} from './social'

import Hook from '../../util/hook'

// The root provides a resolver function for each API endpoint
export const resolver = (db) => {

    //db.collection('DynamicTypes')
    //TODO implement logic for dynamictypes???

    // default core resolvers
    const resolvers = {
        ...commonResolver(db),
        ...userResolver(db),
        ...notificationResolver(db),
        ...keyvalueResolver(db),
        ...cmsResolver(db),
        ...systemResolver(db),
        ...socialResolver(db)
    }

    Hook.call('resolver', {db, resolvers})

    return resolvers
}