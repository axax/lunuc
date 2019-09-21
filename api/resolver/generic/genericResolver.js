import Util from '../../util'
import {ObjectId} from 'mongodb'
import {getFormFields, getType} from 'util/types'
import config from 'gen/config'
import {
    CAPABILITY_MANAGE_TYPES,
    CAPABILITY_MANAGE_OTHER_USERS
} from 'util/capabilities'
import Hook from 'util/hook'
import AggregationBuilder from './AggregationBuilder'
import Cache from 'util/cache'

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

const manualManipulations = (data, typeName)=>{

    // TODO: with mongodb 4 this can be removed as convert and toString is supported
    if( data.results){
        const typeDefinition = getType(typeName) || {}
        if( typeDefinition.fields ) {
            let hasField = false

            for (let i = 0; i < data.results.length; i++) {
                const item = data.results[i]
                for (let y = 0; y < typeDefinition.fields.length; y++) {
                    const field = typeDefinition.fields[y]
                    // convert type Object to String
                    if (field && field.type === 'Object' && item[field.name]) {

                        hasField = true

                        if (item[field.name].constructor === Object) {
                            console.log(`convert ${typeName}.${field.name} to string`)
                            item[field.name] = JSON.stringify(item[field.name])
                        }
                    }
                }
                if (!hasField) {
                    break
                }
            }
        }
    }
    return data
}

const GenericResolver = {
    entities: async (db, context, typeName, data, options) => {
        if (!context.lang) {
            throw new Error('lang on context is missing')
        }
        const startTime = new Date()

        let {match, _version, cache, includeCount, ...otherOptions} = options

        const collectionName = await buildCollectionName(db, context, typeName, _version)

        // Default match
        if (!match ) {
            // if not specific match is defined, only select items that belong to the current user
            if (await Util.userHasCapability(db, context, CAPABILITY_MANAGE_TYPES)) {
                match = {}

            } else {
                const typeDefinition = getType(typeName) || {}

                if (!typeDefinition.noUserRelation) {
                    match = {createdBy: ObjectId(context.id)}
                }
            }
        }
        let cacheKey
        if (!isNaN(cache) && cache > 0) {
            cacheKey = collectionName + JSON.stringify(match) + context.lang + JSON.stringify(otherOptions)


            const resultFromCache = Cache.get(cacheKey)
            if (resultFromCache) {
                console.log(`GenericResolver from cache for ${collectionName} complete: total time ${new Date() - startTime}ms`)

                return resultFromCache
            }
        }

        const aggregationBuilder = new AggregationBuilder(typeName, data, {
            match,
            includeCount: (includeCount!==false),
            lang: context.lang, ...otherOptions
        })

        const {dataQuery, countQuery} = aggregationBuilder.query()
        if (typeName.indexOf("GenericData") >= 0) {
         //console.log(JSON.stringify(dataQuery, null, 4))
         }
        //console.log(JSON.stringify(dataQuery, null, 4))
        const collection = db.collection(collectionName)
        const startTimeAggregate = new Date()


        const results = await collection.aggregate(dataQuery, {allowDiskUse: true}).toArray()
        let result
        if (results.length === 0) {
            return {
                page: aggregationBuilder.getPage(),
                limit: aggregationBuilder.getLimit(),
                offset: aggregationBuilder.getOffset(),
                total: 0,
                results: null
            }
        } else {
            result = manualManipulations(results[0], typeName)
        }


        if (result.meta && result.meta.length) {
            result.total = result.meta[0].count
        } else {
            /*const countResults = await collection.aggregate(countQuery, {allowDiskUse: true}).toArray()
            if (countResults.length > 0) {
                result.total = countResults[0].count
            } else {
                result.total = 0
            }*/
            result.total = 0
        }
        //console.log(JSON.stringify(result, null, 4))

        const aggregateTime = new Date() - startTimeAggregate
        //result.meta.aggregateTime = new Date() - startTimeAggregate


        if (cacheKey) {
            Cache.set(cacheKey, result, cache)
        }

        console.log(`GenericResolver for ${collectionName} complete: aggregate time = ${aggregateTime}ms total time ${new Date() - startTime}ms`)
        return result
    },
    createEnity: async (db, context, typeName, {_version, ...data}) => {
        Util.checkIfUserIsLoggedIn(context)

        if (!context.lang) {
            throw new Error('lang on context is missing')
        }

        const collectionName = await buildCollectionName(db, context, typeName, _version)

        let createdBy, username
        if (data.createdBy && data.createdBy !== context.id) {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_OTHER_USERS)
            createdBy = data.createdBy

            // TODO: resolve username
            username = data.createdBy
        } else {
            createdBy = context.id
            username = context.id
        }
        const collection = db.collection(collectionName)
        const insertResult = await collection.insertOne({
            ...data,
            createdBy: ObjectId(createdBy)
        })

        if (insertResult.insertedCount) {
            const doc = insertResult.ops[0]

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

            return {
                _id: doc._id,
                status: 'created',
                createdBy: {
                    _id: ObjectId(createdBy),
                    username
                },
                ...newData
            }
        }
    },
    deleteEnity: async (db, context, typeName, {_version, ...data}) => {

        Util.checkIfUserIsLoggedIn(context)

        if (!data._id) {
            throw new Error('Id is missing')
        }

        const collectionName = await buildCollectionName(db, context, typeName, _version)


        const options = {
            _id: ObjectId(data._id)
        }
        if (!await Util.userHasCapability(db, context, CAPABILITY_MANAGE_OTHER_USERS)) {
            options.createdBy = ObjectId(context.id)
        }

        const collection = db.collection(collectionName)

        const deletedResult = await collection.deleteOne(options)

        if (deletedResult.deletedCount > 0) {

            Hook.call('typeDeleted_' + typeName, {ids: [data._id], db})

            return {
                _id: data._id,
                status: 'deleted'
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
                status: 'deleted'
            })
        })

        const options = {
            _id: {$in}
        }

        if (!await Util.userHasCapability(db, context, CAPABILITY_MANAGE_OTHER_USERS)) {
            options.createdBy = ObjectId(context.id)
        }

        const collection = db.collection(collectionName)

        const deletedResult = await collection.deleteMany(options)

        if (deletedResult.deletedCount > 0) {
            Hook.call('typeDeleted_' + typeName, {ids: data._id, db})
            return result
        } else {
            throw new Error('Error deleting entries. You might not have premissions to manage other users')
        }
    },
    updateEnity: async (db, context, typeName, {_version, ...data}, options) => {

        Util.checkIfUserIsLoggedIn(context)

        if (!data._id) {
            throw new Error('Id is missing')
        }

        const collectionName = await buildCollectionName(db, context, typeName, _version)

        const params = {
            _id: ObjectId(data._id)
        }
        if (!await Util.userHasCapability(db, context, CAPABILITY_MANAGE_OTHER_USERS)) {
            params.createdBy = ObjectId(context.id)
        }

        const collection = db.collection(collectionName)

        //check if this field is a reference
        const fields = getFormFields(typeName)

        // clone object but without _id, _version and undefined property
        // null is when a refrence has been removed
        const dataSet = Object.keys(data).reduce((o, k) => {
            if (k !== '_id' && k !== '_version' && data[k] !== undefined) {
                if (data[k] && data[k].constructor === Object) {

                    // rewrite to dot notation for partial update
                    Object.keys(data[k]).forEach(key => {
                        o[k + '.' + key] = data[k][key]
                    })

                }else if( fields[k] && fields[k].type === 'Object' ){
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
        let result = (await collection.findOneAndUpdate(params, {
            $set: dataSet
        }, {returnOriginal: false}))

        if (result.ok !== 1 || !result.lastErrorObject.updatedExisting) {
            throw new Error(collectionName + ' could not be changed. You might not have premissions to manage other users')
        }
        const returnValue = {
            ...data,
            modifiedAt: dataSet.modifiedAt,
            createdBy: {
                _id: ObjectId(context.id),
                username: context.username
            },
            status: 'updated'
        }

        Hook.call('typeUpdated_' + typeName, {result: returnValue, db})

        return returnValue
    },
    cloneEntity: async (db, context, typeName, {_id, _version, ...rest}) => {

        Util.checkIfUserIsLoggedIn(context)

        const collectionName = await buildCollectionName(db, context, typeName, _version)
        const collection = db.collection(collectionName)

        if (!_id) {
            throw new Error('Id is missing')
        }

        const entry = await collection.findOne({_id: ObjectId(_id)})

        if (!entry) {
            throw new Error('entry with id ' + _id + ' does not exist')
        }

        const clone = Object.assign({}, entry, {createdBy: ObjectId(context.id)}, rest)

        delete clone._id

        const insertResult = await collection.insertOne(clone)
        if (insertResult.insertedCount) {
            const doc = insertResult.ops[0]


            const result = {
                ...clone,
                _id: doc._id,
                status: 'created',
                createdBy: {
                    _id: ObjectId(context.id),
                    username: context.username
                }
            }
            //check if this field is a reference
            const fields = getFormFields(typeName)

            if (fields) {
                Object.keys(result).forEach(field => {
                    if (fields[field] && fields[field].reference) {
                        // is a reference
                        // TODO also resolve fields of subtype
                        result[field] = {_id: result[field]}
                    }
                })
            }

            return result
        }
    },
}

export default GenericResolver
