import GenericResolver from './generic/genericResolver.mjs'
import Util from '../util/index.mjs'
import {ObjectId} from 'mongodb'
import {
    CAPABILITY_MANAGE_TYPES,
    CAPABILITY_MANAGE_KEYVALUES
} from '../../util/capabilities.mjs'
import Cache from '../../util/cache.mjs'

const updateKeyValueGlobal = async ({_id, key, value, ispublic, createdBy}, {context}, db) => {

    let res
    try {
        const dataToUpdate = {
            _id,
            key,
            value
        }

        if (createdBy) {
            dataToUpdate.createdBy = new ObjectId(createdBy)
        } else if (!_id) {
            dataToUpdate.createdBy = new ObjectId(context.id)
            dataToUpdate.ispublic = false
        }

        if (ispublic !== undefined) {
            dataToUpdate.ispublic = ispublic
        }


        res = await GenericResolver.updateEnity(db, context, 'KeyValueGlobal', dataToUpdate, {
            capability: CAPABILITY_MANAGE_TYPES,
            primaryKey: _id ? '_id' : 'key',
            upsert: await Util.userHasCapability(db, context, CAPABILITY_MANAGE_TYPES)
        })


        // TODO: we don't have the key here (sometimes we only have the id)
        // so let clear all KeyValueGlobal
        Cache.clearStartWith('KeyValueGlobal_')

        // clear caches from dataResolver --> see method createCacheKey
        Cache.clearStartWith('dataresolver_keyValueGlobals')


    } catch (e) {
        throw e
    }
    return res
}


export const keyvalueResolver = (db) => ({
    Query: {
        keyValues: async ({keys, limit, sort, offset, page, filter, all, global}, {context}, {operation}) => {
            const match = {}

            if (!all || !await Util.userHasCapability(db, context, CAPABILITY_MANAGE_TYPES)) {
                match.createdBy = new ObjectId(context.id)
            }
            if (keys && keys.length > 0) {
                match.key = {$in: keys}
            }
            const result =  await GenericResolver.entities(db, context, 'KeyValue', ['key', 'value'], {
                limit,
                offset,
                page,
                sort,
                filter,
                match
            })

            if(global){
                const foundKeys = result.results.map(f=>f.key)
                const notFoundKeys = keys.filter(k => foundKeys.indexOf(k)<0 )

                const resultGlobal = await keyvalueResolver(db).Query.keyValueGlobals({keys:notFoundKeys},{context},{operation})

                result.results.push(...resultGlobal.results)
            }

            return result
        },
        keyValueGlobals: async ({keys, limit, sort, offset, page, filter}, {context}, {operation}) => {
            const selection = operation.selectionSet.selections[0].selectionSet.selections

            const querySelection = selection[selection.length - 1].selectionSet.selections

            const fields = []
            querySelection.forEach(se => {
                const val = se.name.value
                if(val!=='status' && val!=='_id' && val!=='createdBy')
                {
                    fields.push(val)
                }
            })

            if (fields.length === 0) {
                fields.push('key', 'value', 'ispublic')
            }

            const match = {}
            if (keys && keys.length > 0) {
                match.key = {$in: keys}
            }
            // if user don't have capability to manage keys he can only see the public ones or the one that are assign to them
            if (!await Util.userHasCapability(db, context, CAPABILITY_MANAGE_KEYVALUES)) {
                match.$or = [{createdBy: {$in: await Util.userAndJuniorIds(db, context.id)}}, {ispublic: true}]
            }
            const data = await GenericResolver.entities(db, context, 'KeyValueGlobal', fields, {
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
                    createdBy: new ObjectId(context.id),
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
                createdBy: (createdBy ? new ObjectId(createdBy) : createdBy)
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
        cloneKeyValue: async (data, {context}) => {
            return GenericResolver.cloneEntity(db, context, 'KeyValue', data)
        },
        createKeyValueGlobal: async ({key, value, ispublic}, req) => {
            await Util.checkIfUserHasCapability(db, req.context, CAPABILITY_MANAGE_TYPES)
            return await GenericResolver.createEntity(db, req, 'KeyValueGlobal', {key, value, ispublic})
        },
        updateKeyValueGlobal: async (data, req) => {
            return await updateKeyValueGlobal(data, req, db)
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
                        _id: new ObjectId(context.id),
                        username: context.username
                    },
                }
            })
        },
        setKeyValueGlobal: async ({key, value}, {context}) => {

            // check if key already exists
            const existing = await db.collection('KeyValueGlobal').distinct('_id',{key})
            const data = {key, value}
            if(existing && existing.length>0){
                data._id = existing[0]
            }
            return await updateKeyValueGlobal(data, {context}, db)


            /*
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_TYPES)

            // update or insert if not exists
            return Util.setKeyValueGlobal(db, context, key, value).then((doc) => {
                return {
                    key,
                    value,
                    status: 'created',
                    createdBy: {
                        _id: new ObjectId(context.id),
                        username: context.username
                    }
                }
            })*/
        },
        deleteKeyValueByKey: async ({key}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)

            const collection = db.collection('KeyValue')

            const deletedResult = await collection.deleteOne({createdBy: new ObjectId(context.id), key})

            if (deletedResult.deletedCount) {
                return {
                    key,
                    createdBy: {
                        _id: new ObjectId(context.id),
                        username: context.username
                    },
                    status: 'deleted'
                }
            } else {
                return {
                    key,
                    createdBy: {
                        _id: new ObjectId(context.id),
                        username: context.username
                    },
                    status: 'error'
                }
            }
        },
        cloneKeyValueGlobal: async (data, {context}) => {
            return GenericResolver.cloneEntity(db, context, 'KeyValueGlobal', data)
        }
    }
})
