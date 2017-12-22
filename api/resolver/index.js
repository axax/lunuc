import {commonResolver} from './common'
import {userResolver} from './user'
import {chatResolver} from './chat'
import {wordResolver} from './word'
import {postResolver} from './post'
import {notificationResolver} from './notification'
import {keyvalueResolver} from './keyvalue'
import {cmsResolver} from './cms'
import {systemResolver} from './system'

// The root provides a resolver function for each API endpoint
export const resolver = (db) => {
	return ({
		...commonResolver(db),
		...chatResolver(db),
		...userResolver(db),
		...notificationResolver(db),
		...keyvalueResolver(db),
		...wordResolver(db),
		...postResolver(db),
		...cmsResolver(db),
        ...systemResolver(db)
	})
}