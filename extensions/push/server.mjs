import Hook from '../../util/hook.cjs'
import schemaGen from './gensrc/schema.mjs'
import resolverGen from './gensrc/resolver.mjs'
import schema from './schema/index.mjs'
import resolver from './resolver/index.mjs'
import {deepMergeToFirst} from '../../util/deepMerge.mjs'
import {sendPush} from './util/push.mjs'

// type PushSubscription (build.json): schema, generic resolver and the indexes come from there
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolverGen(db))
    deepMergeToFirst(resolvers, resolver(db))
})

Hook.on('schema', ({schemas}) => {
    schemas.push(schemaGen)
    schemas.push(schema)
})

/*
 * Other extensions send a push with
 *   Hook.call('pushSend', {db, userIds, topic, notification, ttl, urgency})
 * (see util/push.mjs). Not awaited by the caller: sendPush never rejects.
 */
Hook.on('pushSend', ({db, ...options}) => {
    sendPush(db, options)
})
