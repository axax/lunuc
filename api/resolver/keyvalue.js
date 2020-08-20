import GenericResolver from './generic/genericResolver'
import Util from '../util'
import {ObjectId} from 'mongodb'
import {
    CAPABILITY_MANAGE_TYPES,
    CAPABILITY_MANAGE_KEYVALUES
} from 'util/capabilities'
import Cache from 'util/cache'

export const keyvalueResolver = (db) => ({
    Query: {
        keyValues: async ({keys, limit, sort, offset, page, filter, all}, {context}) => {
            const match = {}

            if (!all || !await Util.userHasCapability(db, context, CAPABILITY_MANAGE_TYPES)) {
                match.createdBy = ObjectId(context.id)
            }
            if (keys && keys.length > 0) {
                match.key = {$in: keys}
            }
            return await GenericResolver.entities(db, context, 'KeyValue', ['key', 'value'], {
                limit,
                offset,
                page,
                sort,
                filter,
                match
            })
        },
        keyValueGlobals: async ({keys, limit, sort, offset, page, filter}, {context}) => {
            const match = {}
            if (keys && keys.length > 0) {
                match.key = {$in: keys}
            }
            // if user don't have capability to manage keys he can only see the public ones
            if (!await Util.userHasCapability(db, context, CAPABILITY_MANAGE_KEYVALUES)) {
                match.ispublic = true
            }

            const data = await GenericResolver.entities(db, context, 'KeyValueGlobal', ['key', 'value', 'ispublic'], {
                limit,
                offset,
                sort,
                page,
                filter,
                match
            })


            for (let i = 0; i < data.results.length; i++) {
                const item = data.results[i]
                if (item.value && item.value.constructor !== String) {
                    item.value = JSON.stringify(item.value)
                }
            }

            return data
        },
        keyValue: async ({key}, {context}) => {
            const keyValues = await GenericResolver.entities(db, context, 'KeyValue', ['key', 'value'], {
                match: {
                    createdBy: ObjectId(context.id),
                    key
                }
            })
            if (keyValues && keyValues.results)
                return keyValues.results[0]
        }
    },
    Mutation: {
        createKeyValue: async ({key, value, createdBy}, req) => {
            await Util.checkIfUserHasCapability(db, req.context, CAPABILITY_MANAGE_TYPES)

            return await GenericResolver.createEntity(db, req, 'KeyValue', {key, value, createdBy})
        },
        updateKeyValue: async ({_id, key, value, createdBy}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_TYPES)

            return await GenericResolver.updateEnity(db, context, 'KeyValue', {
                _id,
                key,
                value,
                createdBy: (createdBy ? ObjectId(createdBy) : createdBy)
            })
        },
        deleteKeyValue: async ({_id}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_TYPES)
            return GenericResolver.deleteEnity(db, context, 'KeyValue', {_id})
        },
        deleteKeyValues: async ({_id}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_TYPES)
            return GenericResolver.deleteEnities(db, context, 'KeyValue', {_id})
        },
        createKeyValueGlobal: async ({key, value, ispublic}, req) => {
            await Util.checkIfUserHasCapability(db, req.context, CAPABILITY_MANAGE_TYPES)
            return await GenericResolver.createEntity(db, req, 'KeyValueGlobal', {key, value, ispublic})
        },
        updateKeyValueGlobal: async ({_id, key, value, ispublic, createdBy}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_TYPES)

            // TODO: we don't have the key here (sometimes we only have the id)
            // so let clear all KeyValueGlobal
            Cache.clearStartWith('KeyValueGlobal_')

            // clear caches from dataResolver --> see method createCacheKey
            Cache.clearStartWith('dataresolver_keyValueGlobals')

            return await GenericResolver.updateEnity(db, context, 'KeyValueGlobal', {
                _id,
                key,
                value,
                ispublic,
                createdBy
            })
        },
        deleteKeyValueGlobal: async ({_id}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_TYPES)
            return await GenericResolver.deleteEnity(db, context, 'KeyValueGlobal', {_id})
        },
        deleteKeyValueGlobals: async ({_id}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_TYPES)
            return await GenericResolver.deleteEnities(db, context, 'KeyValueGlobal', {_id})
        },
        setKeyValue: async ({key, value}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)
            //await Util.checkIfUserHasCapability(db, context, 'manage_keyvalues')

            // update or insert if not exists
            return Util.setKeyValue(db, context, key, value).then((doc) => {
                return {
                    key,
                    value,
                    status: 'created',
                    createdBy: {
                        _id: ObjectId(context.id),
                        username: context.username
                    },
                }
            })
        },
        setKeyValueGlobal: async ({key, value}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_TYPES)

            // update or insert if not exists
            return Util.setKeyValueGlobal(db, context, key, value).then((doc) => {
                return {
                    key,
                    value,
                    status: 'created',
                    createdBy: {
                        _id: ObjectId(context.id),
                        username: context.username
                    }
                }
            })
        },
        deleteKeyValueByKey: async ({key}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)

            const collection = db.collection('KeyValue')

            const deletedResult = await collection.deleteOne({createdBy: ObjectId(context.id), key})

            if (deletedResult.deletedCount) {
                return {
                    key,
                    createdBy: {
                        _id: ObjectId(context.id),
                        username: context.username
                    },
                    status: 'deleted'
                }
            } else {
                return {
                    key,
                    createdBy: {
                        _id: ObjectId(context.id),
                        username: context.username
                    },
                    status: 'error'
                }
            }
        },
    }
})
