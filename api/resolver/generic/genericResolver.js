import Util from '../../util'
import {ObjectId} from 'mongodb'
import {getType} from 'util/types'
import {getFormFieldsByType} from 'util/typesAdmin'
import config from 'gen/config'
import {
    CAPABILITY_MANAGE_TYPES, CAPABILITY_MANAGE_SAME_GROUP,
    CAPABILITY_MANAGE_OTHER_USERS, CAPABILITY_MANAGE_KEYVALUES, CAPABILITY_MANAGE_COLLECTION
} from 'util/capabilities'
import Hook from 'util/hook'
import HookAsync from 'util/hookAsync'
import AggregationBuilder from './AggregationBuilder'
import Cache from 'util/cache'
import {_t} from '../../../util/i18nServer'

const {DEFAULT_LANGUAGE} = config

const buildCollectionName = async (db, context, typeName, _version) => {

    if (!_version) {
        const values = await Util.keyValueGlobalMap(db, context, ['TypesSelectedVersions'])
        if (values && values['TypesSelectedVersions']) {
            _version = values['TypesSelectedVersions'][typeName]
        }
    }

    return typeName + (_version && _version !== 'default' ? '_' + _version : '')
}

const postConvertData = async (data, {typeName, db}) => {

    // here is a good place to handle: Cannot return null for non-nullable
    const repairMode = true

    if (data.results) {
        const typeDefinition = getType(typeName) || {}
        if (typeDefinition.fields) {
            let hasField = false

            for (let i = 0; i < data.results.length; i++) {
                const item = data.results[i]

                if (item.createdBy === null) {
                    item.createdBy = {_id: 0, username: 'null reference'}
                }

                for (let y = 0; y < typeDefinition.fields.length; y++) {
                    const field = typeDefinition.fields[y]
                    // convert type Object to String
                    // item[field.name] = JSON.stringify(item[field.name])
                    if (field) {
                        if (field.type === 'Object') {
                            hasField = true
                            // TODO: with mongodb 4 this can be removed as convert and toString is supported
                            if (item[field.name] && (item[field.name].constructor === Object || item[field.name].constructor === Array)) {
                                //console.log(`convert ${typeName}.${field.name} to string`)
                                item[field.name] = JSON.stringify(item[field.name])
                            }
                        } else if (field.reference) {
                            const refTypeDefinition = getType(field.type) || {}
                            for (let z = 0; z < refTypeDefinition.fields.length; z++) {
                                const refField = refTypeDefinition.fields[z]
                                if (refField) {
                                    if (refField.type === 'Object') {

                                        if (item[field.name] && item[field.name][refField.name] && (item[field.name][refField.name].constructor === Object || item[field.name][refField.name].constructor === Array)) {
                                            //console.log(`convert ${typeName}.${field.name}.${refField.name} to string`)
                                            item[field.name][refField.name] = JSON.stringify(item[field.name][refField.name])
                                        }

                                    }
                                }
                            }
                        }

                        const dyn = field.dynamic

                        if (dyn) {
                            hasField = true

                            if (dyn.action === 'count') {
                                const query = Object.assign({}, dyn.query)
                                if (query) {
                                    Object.keys(query).forEach(k => {
                                        if (query[k] === '_id') {
                                            query[k] = item._id
                                        } else if (query[k].$in && query[k].$in[0] === '_id') {
                                            query[k] = Object.assign({}, query[k])
                                            query[k].$in = [...query[k].$in]
                                            query[k].$in[0] = item._id
                                        }
                                    })
                                }
                                item[field.name] = await db.collection(dyn.type).count(query)
                            }

                        }
                    }


                    // in case a field changed to localized
                    /*if( field.localized ){
                     hasField = true
                     if (item[field.name].constructor !== Object) {
                     const translations = {}
                     config.LANGUAGES.forEach(lang => {
                     translations[lang] = item[field.name]
                     })
                     item[field.name] = translations
                     }
                     }*/
                }


                if (!repairMode && !hasField) {
                    break
                }
            }
        }
    }
    return data
}

const extendWithOwnerGroupMatch = (typeDefinition, context, match) => {
    if (typeDefinition && context.role !== 'subscriber' && context.group && context.group.length > 0) {
        // check for same ownerGroup
        const ownerGroup = typeDefinition.fields.find(f => f.name === 'ownerGroup')
        if (ownerGroup) {
            const ownerMatch = {ownerGroup: {$in: context.group.map(f => ObjectId(f))}}
            if (match) {
                match = {$or: [match, ownerMatch]}
            } else {
                match = ownerMatch
            }
        }
    }
    return match
}

const createMatchForCurrentUser = async ({typeName, db, context, operation}) => {
    let match

    if(!operation){
        operation='read'
    }

    if (typeName === 'User') {

        // special handling for type User

        match = {_id: {$in: await Util.userAndJuniorIds(db, context.id)}}

        if (context.group && context.group.length > 0) {
            // if user has capability to manage subscribers
            // show subscribers that are in the same group
            const userCanManageSameGroup = await Util.userHasCapability(db, context, CAPABILITY_MANAGE_SAME_GROUP)

            if (userCanManageSameGroup) {
                match = {$or: [match, {group: {$in: context.group.map(f => ObjectId(f))}}]}
            }
        }

    } else {
        const typeDefinition = getType(typeName)
        let userFilter = true
        if (typeDefinition) {
            if (typeDefinition.noUserRelation) {
                userFilter = false
            }
            if (typeDefinition.access && typeDefinition.access[operation]) {
                if (await Util.userHasCapability(db, context, typeDefinition.access[operation])) {
                    // user can read everything
                    return {}
                } else if (typeDefinition.noUserRelation) {
                    // user has no permission
                    return
                }
            }
        }

        if (userFilter) {
            match = {createdBy: {$in: await Util.userAndJuniorIds(db, context.id)}}
        }

        match = extendWithOwnerGroupMatch(typeDefinition, context, match)

    }

    return match
}

const GenericResolver = {
    entities: async (db, context, typeName, data, options) => {
        if (!context.lang) {
            throw new Error('lang on context is missing')
        }
        const startTime = new Date()

        let {match, _version, cache, includeCount, postConvert, aggregateOptions, ...otherOptions} = options

        const collectionName = await buildCollectionName(db, context, typeName, _version)

        const userCanManageTypes = await Util.userHasCapability(db, context, CAPABILITY_MANAGE_TYPES)

        // Default match
        if (!match) {
            if (userCanManageTypes) {
                // the user has the right to read everything
                match = {}
            } else {
                // only select items that belong to the current user or the user has permission to read
                match = await createMatchForCurrentUser({typeName, db, context})

            }

        }

        if(!match){
            throw new Error(`no permission to read data for type ${typeName}`)
        }
        //console.log(`1 time ${new Date() - startTime}ms`)

        let cacheKey, cacheTime, cachePolicy
        if (cache !== undefined) {
            if (cache.constructor === Object) {
                if (cache.if !== 'false') {
                    cacheTime = cache.expires === undefined ? 60000 : cache.expires
                    cacheKey = cache.key
                    cachePolicy = cache.policy
                }
            } else {
                cacheTime = cache
            }
            if (!isNaN(cacheTime) && cacheTime > 0) {
                if (!cacheKey) {
                    //create cacheKey
                    cacheKey = collectionName + JSON.stringify(match) + context.lang + JSON.stringify(otherOptions)
                }
                if (cachePolicy !== 'cache-only') {
                    const resultFromCache = Cache.get(cacheKey)
                    if (resultFromCache) {
                        console.log(`GenericResolver from cache for ${collectionName} complete: total time ${new Date() - startTime}ms`)

                        return resultFromCache
                    }
                }
            }
        }

        if (Hook.hooks['beforeTypeLoaded'] && Hook.hooks['beforeTypeLoaded'].length) {
            for (let i = 0; i < Hook.hooks['beforeTypeLoaded'].length; ++i) {
                await Hook.hooks['beforeTypeLoaded'][i].callback({
                    type: typeName, db, context, otherOptions, match, data
                })
            }
        }

        const estimateCount = includeCount !== false && !options.filter && Object.keys(match).length === 0

        const aggregationBuilder = new AggregationBuilder(typeName, data, db, {
            match,
            includeCount: (includeCount !== false && !estimateCount),
            lang: context.lang,
            ...otherOptions,
            includeUserFilter: userCanManageTypes
        })

        const {dataQuery, countQuery, debugInfo} = await aggregationBuilder.query()
      /*   if (typeName.indexOf("UserTracking") >= 0) {
             console.log(JSON.stringify(dataQuery, null, 4))
         }*/
              //console.log(options,JSON.stringify(dataQuery, null, 4))
        const collection = db.collection(collectionName)
        const startTimeAggregate = new Date()

        const finalAggregateOptions = {allowDiskUse: true, ...aggregateOptions}

        const results = await collection.aggregate(dataQuery, finalAggregateOptions).toArray()
        let result
        if (results.length === 0) {
            result = {
                page: aggregationBuilder.getPage(),
                limit: aggregationBuilder.getLimit(),
                offset: aggregationBuilder.getOffset(),
                total: 0,
                results: null
            }
        } else {
            if (postConvert === false) {
                result = results[0]
            } else {
                result = await postConvertData(results[0], {typeName, db, context})
            }
        }

        if (result.count && result.count.length > 0) {
            result.total = result.count[0].count
            delete result.count
        } else {
            result.total = estimateCount ? await collection.estimatedDocumentCount() : 0
        }

        //console.log(JSON.stringify(result, null, 4))

        const aggregateTime = new Date() - startTimeAggregate
        const totalTime = new Date() - startTime




        if (Hook.hooks['typeLoaded'] && Hook.hooks['typeLoaded'].length) {
            for (let i = 0; i < Hook.hooks['typeLoaded'].length; ++i) {
                await Hook.hooks['typeLoaded'][i].callback({
                    type: typeName,
                    data,
                    db,
                    context,
                    otherOptions,
                    result,
                    dataQuery,
                    collectionName,
                    aggregateTime,
                    debugInfo
                })
            }
        }

        if (otherOptions.returnMeta !== false) {
            if(!result.meta){
                result.meta = {}
            }

            result.meta.aggregateTime = aggregateTime
            result.meta.totalTime = totalTime
            result.meta.debugInfo = debugInfo

        }

        if(result.meta){
            result.meta = JSON.stringify(result.meta)
        }




        if (cacheKey) {
            Cache.set(cacheKey, result, cacheTime)
        }

        console.log(`GenericResolver for ${collectionName} complete: aggregate time = ${aggregateTime}ms total time ${totalTime}ms`)
        return result
    },
    createEntity: async (db, req, typeName, {_version, ...data}, options) => {
        const {context} = req


        const typeDefinition = getType(typeName)

        let userContext = context

        if (typeDefinition && typeDefinition.access && typeDefinition.access.create) {
            if (await Util.userHasCapability(db, context, typeDefinition.access.create)) {
                userContext = await Util.userOrAnonymousContext(db, context)
            }
        }

        Util.checkIfUserIsLoggedIn(userContext)


        if (Hook.hooks['typeBeforeCreate'] && Hook.hooks['typeBeforeCreate'].length) {
            for (let i = 0; i < Hook.hooks['typeBeforeCreate'].length; ++i) {
                await Hook.hooks['typeBeforeCreate'][i].callback({
                    type: typeName, _version, data, db, req
                })
            }
        }


        if (!context.lang) {
            throw new Error('lang on context is missing')
        }

        const collectionName = await buildCollectionName(db, context, typeName, _version)

        let createdBy, username
        if (data.createdBy && data.createdBy !== context.id) {
            if (!options || !options.skipCheck) {
                await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_OTHER_USERS)
            }
            createdBy = data.createdBy

            // TODO: resolve username
            username = data.createdBy
        } else {
            createdBy = userContext.id
            username = userContext.username
        }

        //check if this field is a reference
        const fields = getFormFieldsByType(typeName)


        const dataSet = Object.keys(data).reduce((o, k) => {
            if (fields[k] && fields[k].type === 'Object' && data[k] && data[k].constructor !== Object) {
                // store as object
                o[k] = JSON.parse(data[k])
            } else {
                o[k] = data[k]
            }
            return o
        }, {})

        const collection = db.collection(collectionName)

        const insertResult = await collection.insertOne({
            ...dataSet,
            createdBy: ObjectId(createdBy)
        })

        if (insertResult.insertedId) {
            const newData = Object.keys(data).reduce((o, k) => {
                const item = data[k]
                if (item === null || item === undefined) {

                } else if (item.constructor === Array) {
                    o[k] = item.reduce((a, _id) => {
                        a.push({_id})
                        return a
                    }, [])
                } else if (item.constructor === ObjectId) {
                    o[k] = {_id: item}
                } else {
                    o[k] = item
                }
                return o
            }, {})

            const resultData = {
                _id: insertResult.insertedId,
                status: 'created',
                createdBy: {
                    _id: ObjectId(createdBy),
                    username
                },
                ...newData
            }

            Hook.call('typeCreated', {type: typeName, data, result:resultData, db, context})
            Hook.call('typeCreated_' + typeName, {data, db, context, result:resultData})

            return resultData
        }
    },
    deleteEnity: async (db, context, typeName, {_version, ...data}) => {

        Util.checkIfUserIsLoggedIn(context)

        if (!data._id) {
            throw new Error('Id is missing')
        }

        const collectionName = await buildCollectionName(db, context, typeName, _version)

        let match = {}
        if (!await Util.userHasCapability(db, context, CAPABILITY_MANAGE_OTHER_USERS)) {
            match = await createMatchForCurrentUser({typeName, db, context, operation:'delete'})
        }

        if(!match){
            throw new Error(`no permission to delete data for type ${typeName}`)
        }

        match._id= ObjectId(data._id)

        const collection = db.collection(collectionName)

        const deletedResult = await collection.findOneAndDelete(match)

        if (deletedResult.ok && deletedResult.value) {
            Hook.call('typeDeleted', {
                type: typeName,
                ids: [data._id],
                db,
                context,
                deletedDocuments: [deletedResult.value]
            })
            Hook.call('typeDeleted_' + typeName, {
                ids: [data._id],
                db,
                context,
                deletedDocuments: [deletedResult.value]
            })

            return {
                _id: data._id,
                status: 'deleted',
                createdBy: {
                    _id: ObjectId(context.id),
                    username: context.username
                }
            }
        } else {
            throw new Error('Error deleting entry. You might not have premissions to manage other users')
        }
    },
    deleteEnities: async (db, context, typeName, {_version, ...data}) => {

        Util.checkIfUserIsLoggedIn(context)

        if (data._id.constructor !== Array || !data._id.length) {
            throw new Error('Id is missing')
        }

        const collectionName = await buildCollectionName(db, context, typeName, _version)


        const $in = []
        const result = []
        data._id.forEach(id => {
            $in.push(ObjectId(id))
            result.push({
                _id: id,
                status: 'deleted',
                createdBy: {
                    _id: ObjectId(context.id),
                    username: context.username
                }
            })
        })



        let match = {}
        if (!await Util.userHasCapability(db, context, CAPABILITY_MANAGE_OTHER_USERS)) {
            match = await createMatchForCurrentUser({typeName, db, context, operation:'delete'})
        }


        if(!match){
            throw new Error(`no permission to delete data for type ${typeName}`)
        }

        match._id= {$in}


        const collection = db.collection(collectionName)

        const deletedDocuments = await collection.find(match).toArray()

        const deletedResult = await collection.deleteMany(match)

        if (deletedResult.deletedCount > 0) {
            Hook.call('typeDeleted', {type: typeName, ids: data._id, deletedDocuments, db, context})
            Hook.call('typeDeleted_' + typeName, {ids: data._id, deletedDocuments, db, context})
            return result
        } else {
            throw new Error('Error deleting entries. You might not have premissions to manage other users')
        }
    },
    updateEnity: async (db, context, typeName, {_version, _meta, ...data}, options) => {


        Util.checkIfUserIsLoggedIn(context)

        const payload = {}

        await HookAsync.call('typeBeforeUpdate', {type: typeName, _version, _meta, data, db, context, payload})


        if (!options) {
            options = {}
        }

        let primaryKey = options.primaryKey || '_id'
        const params = {}

        if(primaryKey.constructor === Array){

            primaryKey.forEach(pk=>{
                if (!data[pk]) {
                    throw new Error(`primary key ${pk} is missing`)
                }
                params[pk] = ObjectId.isValid(data[pk])?ObjectId(data[pk]):data[pk]
            })

        }else {

            if (!data[primaryKey]) {
                throw new Error(`primary key ${primaryKey} is missing`)
            }
            params[primaryKey] = ObjectId.isValid(data[primaryKey])?ObjectId(data[primaryKey]):data[primaryKey]
        }


        const collectionName = await buildCollectionName(db, context, typeName, _version)



        if (!await Util.userHasCapability(db, context, options.capability ? options.capability : CAPABILITY_MANAGE_OTHER_USERS)) {

            if (data.createdBy && data.createdBy.toString() !== context.id) {

                if(!context.group || context.group.length===0){
                    throw new Error('user is not allow to change field createdBy')
                }

                // check if has same owenerGroup
                const newUser = await Util.userById(db,data.createdBy)
                const found = newUser && newUser.group && newUser.group.some(r=> context.group.includes(r.toString()))

                if(!found){
                    throw new Error('user is not allow to set createdBy with user from another group')
                }
            }

            if (typeName === 'User') {
                const ids = await Util.userAndJuniorIds(db, context.id)

                if (ids.indexOf(params._id) < 0) {
                    throw new Error(_t('core.update.permission.error', context.lang, {name: collectionName}))
                }

            } else {

                const typeDefinition = getType(typeName)
                let userFilter = true
                let match
                if (typeDefinition) {
                    if (typeDefinition.access && typeDefinition.access.update) {
                        if (await Util.userHasCapability(db, context, typeDefinition.access.update)) {
                            userFilter = false
                        }
                    }
                }

                if (userFilter) {
                    match = {createdBy: {$in: await Util.userAndJuniorIds(db, context.id)}}
                }

                match = extendWithOwnerGroupMatch(typeDefinition, context, match)

                if(match){
                    Object.keys(match).forEach(k=>{
                        params[k] = match[k]
                    })
                }

                // use
                delete data.ownerGroup
            }
        }

        const collection = db.collection(collectionName)

        //check if this field is a reference
        const fields = getFormFieldsByType(typeName)

        // clone object but without _id, _version and undefined property
        // null is when a refrence has been removed
        const dataSet = Object.keys(data).reduce((o, k) => {
            if (k !== '_id' && k !== '_version' && data[k] !== undefined) {
                if (data[k] && data[k].constructor === Object) {

                    // rewrite to dot notation for partial update
                    Object.keys(data[k]).forEach(key => {
                        o[k + '.' + key] = data[k][key]
                    })

                } else if (data[k] && fields[k] && fields[k].type === 'Object') {
                    // store as object
                    o[k] = JSON.parse(data[k])

                } else {
                    o[k] = data[k]
                }
            }
            return o
        }, {})
        // set timestamp
        dataSet.modifiedAt = new Date().getTime()
        // try with dot notation for partial update

        const updateOptions = {}
        if (options.upsert) {
            updateOptions.upsert = true
        }

        let result = (await collection.updateOne(params, {
            $set: dataSet
        }, updateOptions))

        if (result.modifiedCount !== 1 && result.upsertedCount !== 1) {
            throw new Error(_t('core.update.permission.error', context.lang, {name: collectionName}))
        }

        const newData = Object.keys(data).reduce((o, k) => {
            const item = data[k]
            if (k !== '_id' && item && item.constructor === ObjectId) {
                o[k] = {_id: item}
            } else {
                o[k] = item
            }
            return o
        }, {})

        const returnValue = {
            ...newData,
            modifiedAt: dataSet.modifiedAt,
            createdBy: {
                _id: ObjectId(context.id),
                username: context.username
            },
            status: 'updated'
        }

        if (_meta) {
            const meta = JSON.parse(_meta)
            if (meta.clearCachePrefix) {
                Cache.clearStartWith(meta.clearCachePrefix)
            }
        }

        if (!options.ignoreHooks) {
            Hook.call('typeUpdated', {type: typeName, data, db, context, payload})
            Hook.call('typeUpdated_' + typeName, {result: returnValue, db})
        }
        return returnValue
    },
    cloneEntity: async (db, context, typeName, {_id, _version, ...rest}) => {


        const collectionName = await buildCollectionName(db, context, typeName, _version)
        const collection = db.collection(collectionName)

        if (!_id) {
            throw new Error('Id is missing')
        }


        let match = {_id: ObjectId(_id)}
        if (!await Util.userHasCapability(db, context, CAPABILITY_MANAGE_TYPES)) {
            if (typeName === 'User') {
                throw new Error('Error cloning entry. You might not have premissions to manage other users')

            } else {
                match.createdBy = {$in: await Util.userAndJuniorIds(db, context.id)}
            }
        }

        const entry = await collection.findOne(match)

        if (!entry) {
            throw new Error('entry with id ' + _id + ' does not exist')
        }

        const clone = Object.assign({}, entry, {modifiedAt: null, createdBy: ObjectId(context.id)}, rest)

        delete clone._id

        const insertResult = await collection.insertOne(clone)
        if (insertResult.insertedId) {

            const result = {
                _id: insertResult.insertedId,
                status: 'created',
                createdBy: {
                    _id: ObjectId(context.id),
                    username: context.username
                }
            }
            //check if this field is a reference
            const fields = getFormFieldsByType(typeName)

            if (fields) {
                Object.keys(result).forEach(field => {
                    if (fields[field] && result[field]) {
                        if (fields[field].reference && result[field].constructor !== Object) {
                            // is a reference
                            // TODO also resolve fields of subtype
                            result[field] = {_id: result[field]}
                        } else if (fields[field].type === 'Object' && result[field].constructor === Object) {
                            result[field] = JSON.stringify(result[field])
                        }
                    }
                })
            }
            Hook.call('typeCloned', {type: typeName, db, context})
            Hook.call('typeCloned_' + typeName, {db, context, result})

            return result
        }
    },
}

export default GenericResolver
