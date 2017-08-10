import {userResolver} from './user'
import {chatResolver} from './chat'
import {wordResolver} from './word'
import {notificationResolver} from './notification'
import {keyvalueResolver} from './keyvalue'

// The root provides a resolver function for each API endpoint
export const resolver = (db) => {
	return ({
		...chatResolver(db),
		...userResolver(db),
		...notificationResolver(db),
		...keyvalueResolver(db),
		...wordResolver(db)
	})
}