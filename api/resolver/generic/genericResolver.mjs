import Util from '../../util/index.mjs'
import {ObjectId} from 'mongodb'
import {getType} from '../../../util/types.mjs'
import {getFormFieldsByType} from '../../../util/typesAdmin.mjs'
import {
    CAPABILITY_MANAGE_TYPES, CAPABILITY_MANAGE_SAME_GROUP,
    CAPABILITY_MANAGE_OTHER_USERS
} from '../../../util/capabilities.mjs'
import Hook from '../../../util/hook.cjs'
import HookAsync from '../../../util/hookAsync.mjs'
import AggregationBuilder from './AggregationBuilder.mjs'
import Cache from '../../../util/cache.mjs'
import {_t} from '../../../util/i18nServer.mjs'
import {extendWithOwnerGroupMatch} from '../../util/dbquery.mjs'
import postQueryConvert from './postQueryConverter.mjs'

const buildCollectionName = async (db, context, typeName, _version) => {

    if (!_version) {
        const values = await Util.keyValueGlobalMap(db, context, ['TypesSelectedVersions'])
        if (values && values['TypesSelectedVersions']) {
            _version = values['TypesSelectedVersions'][typeName]
        }
    }

    return typeName + (_version && _version !== 'default' ? '_' + _version : '')
}

const createMatchForCurrentUser = async ({typeName, db, context, operation}) => {
    let match

    if(!operation){
        operation='read'
    }

    if( typeName === 'UserRole'){
        match={name:{$in:['subscriber',context.role]}}
        const typeDefinition = getType(typeName)
        match = extendWithOwnerGroupMatch(typeDefinition, context, match, true)
    }else if (typeName === 'User') {

        // special handling for type User
        match = {_id: {$in: await Util.userAndJuniorIds(db, context.id)}}

        if (context.group && context.group.length > 0) {
            // if user has capability to manage subscribers
            // show subscribers that are in the same group
            const userCanManageSameGroup = await Util.userHasCapability(db, context, CAPABILITY_MANAGE_SAME_GROUP)

            if (userCanManageSameGroup) {
                match = {$or: [match, {group: {$in: context.group.map(f => new ObjectId(f))}}]}
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
                    match = {}
                    if (typeDefinition.access[operation].type === 'roleAndUser') {
                        if (userFilter) {
                            match = {createdBy: {$in: await Util.userAndJuniorIds(db, context.id)}}
                        }
                        match = extendWithOwnerGroupMatch(typeDefinition, context, match, userFilter)
                    }
                    // user has general rights to access type
                    return match
                } else/* if (typeDefinition.noUserRelation)*/ {
                    // user has no permission to access type
                    return
                }
            }
        }

        if (userFilter) {
            match = {createdBy: {$in: await Util.userAndJuniorIds(db, context.id)}}
        }

        match = extendWithOwnerGroupMatch(typeDefinition, context, match, userFilter)

    }

    return match
}

async function resolveReferences(typeName, result, db, context) {

    //check if this field is a reference
    const fields = getFormFieldsByType(typeName)
    if (fields) {
        const fieldKeys = Object.keys(result)
        for (const field of fieldKeys) {
            if (fields[field] && result[field]) {
                if (fields[field].reference && result[field].constructor !== Object) {

                    let subFields = fields[field].fields
                    if(!subFields){
                        subFields = getFormFieldsByType(fields[field].type)
                        if(!subFields){
                            subFields = []
                        }else{
                            subFields = Object.keys(subFields)
                        }
                    }

                    // is a reference
                    if (fields[field].multi) {

                        const newResultList = []
                        const list = result[field].constructor === Array ? result[field] : [result[field]]

                        for (const objectId of list) {
                            const subEntries = await GenericResolver.entities(db, context, fields[field].type, subFields, {
                                limit:1,
                                includeCount:false,
                                match: {_id: objectId}
                            })

                            if (subEntries.results.length>0) {
                                newResultList.push(subEntries.results[0])
                            } else {
                                newResultList.push({_id: f})
                            }
                        }
                        result[field] = newResultList
                    } else {
                        const subEntries = await GenericResolver.entities(db, context, fields[field].type, subFields, {
                            limit:1,
                            includeCount:false,
                            match: {_id: result[field]}
                        })

                        if (subEntries.results.length>0) {
                            result[field] = subEntries.results[0]
                        } else {
                            result[field] = {_id: result[field]}
                        }
                    }
                } else if (fields[field].type === 'Object' && result[field].constructor === Object) {
                    result[field] = JSON.stringify(result[field])
                }
            }
        }
    }
}

export const prepareDataForUpdate = (typeName, data) => {
    //check if this field is a reference
    const fields = getFormFieldsByType(typeName)
    // clone object but without _id, _version and undefined property
    // null is when a refrence has been removed
    const dataSet = Object.keys(data).reduce((o, k) => {
        if (k !== '_id' && k !== '_version' && data[k] !== undefined) {
            if (data[k] && data[k].constructor === Object) {


                // rewrite for partial update
                let keyNotation = {}
                Object.keys(data[k]).forEach(key => {
                    if(data[k][key]!==null) {
                        keyNotation[key] = {$literal:data[k][key]}
                    }
                    //o[k + '.' + key] = data[k][key]
                })

                o[k] = {$cond: {
                    if: {
                        $or:[{$eq: [`$${k}`,null]},{$eq: [`$${k}`,'']}]
                    },
                    then: keyNotation,
                    else: {$mergeObjects: [
                        `$${k}`,
                        keyNotation
                    ]}
                }}

            } else if (data[k] && fields[k] && fields[k].type === 'Object') {
                // store as object
                o[k] = {$literal: JSON.parse(data[k])}
            } else if (fields[k] && fields[k].hash) {
                o[k] = {$literal:Util.hashPassword(data[k])}
            } else {
                o[k] = {$literal:data[k]}
            }
        }
        return o
    }, {})
    // set timestamp
    dataSet.modifiedAt = new Date().getTime()
    return dataSet
}

const GenericResolver = {
    entities: async (db, reqOrContext, typeName, data, options) => {
        let context, req
        if(reqOrContext.context && !reqOrContext.session){
            // it must be a request
            context = reqOrContext.context
            req = reqOrContext
        } else{
            context = reqOrContext
            req = {}
        }

        if (!context.lang) {
            throw new Error('lang on context is missing')
        }
        const startTime = new Date()

        let {match, _version, cache, includeCount, postConvert, aggregateOptions, graphqlInfo, ...otherOptions} = options

        const collectionName = await buildCollectionName(db, context, typeName, _version)

        const userCanManageOtherUsers = await Util.userHasCapability(db, context, CAPABILITY_MANAGE_OTHER_USERS)

        // Default match
        if (!match) {
            if (userCanManageOtherUsers) {
                // the user has the right to read everything
                match = {}
            } else {
                // only select items that belong to the current user or the user has permission to read
                match = await createMatchForCurrentUser({typeName, db, context})

            }

            if(!match){
                throw new Error(`no permission to read data for type ${typeName}`)
            }
        }

        Hook.call('enhanceTypeMatch', {type: typeName, context, match})

        //console.log(`1 time ${new Date() - startTime}ms`)

        let cacheKey, cacheTime, cachePolicy
        if (cache !== undefined && cache !== false) {
            if (cache.constructor === Object) {
                if (cache.if !== 'false' && cache.if !== false) {
                    cacheTime = cache.expires === undefined ? 60000 : cache.expires
                    cacheKey = cache.key
                    cachePolicy = cache.policy
                }
            }else  if (cache === true) {
                cacheTime = 300000
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
                    type: typeName, db, req, context, otherOptions, match, data
                })
            }
        }

        const estimateCount = includeCount !== false && !options.filter && Object.keys(match).length === 0


        const finalAggregateOptions = {allowDiskUse: true, ...aggregateOptions}

        if(!finalAggregateOptions.collation &&
            otherOptions?.sort?.constructor === String &&
            otherOptions.sort.startsWith('$')){

            otherOptions.sort = otherOptions.sort.substring(1)
            finalAggregateOptions.collation =  {locale: context.lang}
        }

        otherOptions.limitCount= 10000
        const aggregationBuilder = new AggregationBuilder(typeName, data, db, {
            match,
            includeCount: (includeCount !== false && !estimateCount),
            lang: context.lang,
            includeUserFilter: userCanManageOtherUsers,
            ...otherOptions
        })

        const {dataQuery, countQuery, debugInfo} = await aggregationBuilder.query()
         /*if (typeName.indexOf("GenericData") >= 0) {
             console.log(otherOptions,JSON.stringify(dataQuery, null, 4))
         }*/
              //console.log(options,JSON.stringify(dataQuery, null, 4))
        const collection = db.collection(collectionName)
        const startTimeAggregate = new Date()


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
                result = await postQueryConvert(results[0], {typeName, db, context, graphqlInfo})
            }
        }

        if(result.total===undefined) {
            if (result.count && result.count.length > 0) {
                result.total = result.count[0].count + (otherOptions.limitCount ? result.offset : 0)
            } else {
                result.total = estimateCount ? await collection.estimatedDocumentCount() : 0
            }
        }
        delete result.count

        /*if (typeName==="Chat") {
            console.log(JSON.stringify(result, null, 4),JSON.stringify(dataQuery, null, 4))
        }*/
        const aggregateTime = new Date() - startTimeAggregate
        const totalTime = new Date() - startTime




        if (Hook.hooks['typeLoaded'] && Hook.hooks['typeLoaded'].length) {
            for (let i = 0; i < Hook.hooks['typeLoaded'].length; ++i) {
                await Hook.hooks['typeLoaded'][i].callback({
                    type: typeName,
                    cacheKey,
                    data,
                    db,
                    req,
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

        if(!context){

            const error = new Error('context is missing '+typeName)

            error.debugData = data

            throw error
        }

        const skipCheck = options && options.skipCheck

        if(!skipCheck && !await Util.userHasAccessRights(db,context,{typeName, access:'create'})){
            throw new Error('Benutzer hat keine Berechtigung zum Erstellen von neuen Einträgen')
        }


        const typeDefinition = getType(typeName)

        let userContext = context

        if (typeDefinition && typeDefinition.access && typeDefinition.access.create) {
            if (await Util.userHasCapability(db, context, typeDefinition.access.create)) {
                userContext = await Util.userOrAnonymousContext(db, context)
            }else {
                throw new Error('Benutzerrole ist nicht befähigt zum Erstellen von neuen Einträgen')
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
            if (!skipCheck) {
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
            } else if(fields[k] && fields[k].hash){
                o[k] =Util.hashPassword(data[k])
            } else {
                o[k] = data[k]
            }
            return o
        }, {})

        for (const [fieldName, field] of Object.entries(fields)) {
            if(field.localized && !dataSet[fieldName]){
                dataSet[fieldName] = {}
            }
        }


        if( fields.ownerGroup && !dataSet.ownerGroup && context.role !== 'administrator' && userContext.group && userContext.group.length > 0 ){
            // set ownerGroup from current user if it is not specified
            dataSet.ownerGroup = userContext.group.map(g => new ObjectId(g))
        }

        const collection = db.collection(collectionName)

        const insertResult = await collection.insertOne({
            ...dataSet,
            createdBy: new ObjectId(createdBy)
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
                    _id: new ObjectId(createdBy),
                    username
                },
                ...newData
            }

            Hook.call('typeCreated', {type: typeName, data, result:resultData, db, context})

            const hookName = 'typeCreated_' + typeName
            if (Hook.hooks[hookName] && Hook.hooks[hookName].length) {
                for (let i = 0; i < Hook.hooks[hookName].length; ++i) {
                    await Hook.hooks[hookName][i].callback({data, db, context, result:resultData})
                }
            }

            return resultData
        }
    },
    deleteEnity: async (db, context, typeName, {_version, ...data}) => {

        Util.checkIfUserIsLoggedIn(context)

        if (!data._id) {
            throw new Error('Id is missing')
        }


        if(!await Util.userHasAccessRights(db,context,{typeName, access:'delete'})){
            throw new Error('Benutzer hat keine Berechtigung zum Löschen')
        }

        const collectionName = await buildCollectionName(db, context, typeName, _version)

        let match = {}
        if (!await Util.userHasCapability(db, context, CAPABILITY_MANAGE_OTHER_USERS)) {
            match = await createMatchForCurrentUser({typeName, db, context, operation:'delete'})
        }

        if(!match){
            throw new Error(`no permission to delete data for type ${typeName}`)
        }

        match._id= new ObjectId(data._id)

        const collection = db.collection(collectionName)

        const deletedResult = await collection.findOneAndDelete(match,{ includeResultMetadata: true })

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
                    _id: new ObjectId(context.id),
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


        if(!await Util.userHasAccessRights(db,context,{typeName, access:'delete'})){
            throw new Error('Benutzer hat keine Berechtigung zum Löschen')
        }

        const collectionName = await buildCollectionName(db, context, typeName, _version)


        const $in = []
        const result = []
        data._id.forEach(id => {
            $in.push(new ObjectId(id))
            result.push({
                _id: id,
                status: 'deleted',
                createdBy: {
                    _id: new ObjectId(context.id),
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

        if (!options) {
            options = {forceAdminContext:false, ignoreHooks:false}
        }


        if(options.forceAdminContext){
            const admin = await Util.userByName(db, 'admin')
            context = Object.assign({},context,{id:admin._id,username:admin.username})
        }

        Util.checkIfUserIsLoggedIn(context)


        if(!await Util.userHasAccessRights(db,context,{typeName, access:'update'})){
            throw new Error('Benutzer hat keine Berechtigung zum Bearbeiten')
        }


        let primaryKey = options.primaryKey || '_id'
        const params = {}

        if(primaryKey.constructor === Array){

            primaryKey.forEach(pk=>{
                if (!data[pk]) {
                    throw new Error(`primary key ${pk} is missing`)
                }
                params[pk] = ObjectId.isValid(data[pk])?new ObjectId(data[pk]):data[pk]
            })

        }else {

            if (!data[primaryKey]) {
                throw new Error(`primary key ${primaryKey} is missing`)
            }
            params[primaryKey] = ObjectId.isValid(data[primaryKey])?new ObjectId(data[primaryKey]):data[primaryKey]
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

                const updateMatch = await createMatchForCurrentUser({typeName, db, context, operation:'update'})

                if(!updateMatch){
                    throw new Error(_t('core.update.permission.error', context.lang, {name: collectionName}))
                }


                /*const typeDefinition = getType(typeName)
                let userFilter = true
                let match
                if (typeDefinition && typeDefinition?.access?.update &&
                    await Util.userHasCapability(db, context, typeDefinition.access.update)) {
                    userFilter = false
                }

                if (userFilter) {
                    match = {createdBy: {$in: await Util.userAndJuniorIds(db, context.id)}}
                }
                match = extendWithOwnerGroupMatch(typeDefinition, context, match, userFilter)*/

                Object.keys(updateMatch).forEach(k=>{
                    params[k] = updateMatch[k]
                })

                // use
                delete data.ownerGroup
            }
        }


        const payload = {}
        await HookAsync.call('typeBeforeUpdate', {type: typeName, _version, params, _meta, data, db, context, payload})

        const collection = db.collection(collectionName)

        // convert to dot notation for partial update
        const dataSet = prepareDataForUpdate(typeName, data)

        const updateOptions = {}
        if (options.upsert) {
            updateOptions.upsert = true
        }

        let newData

        if(options.returnDocument){
            updateOptions.returnDocument = options.returnDocument

            const result = (await collection.findOneAndUpdate(params, [{
                    $set: dataSet
                }], updateOptions))
            if(!result){
                throw new Error(_t('core.update.permission.error', context.lang, {name: collectionName}))
            }
            newData = result
        }else{
            const result = (await collection.updateOne(params, [{
                    $set: dataSet
                }], updateOptions))

            if (result.modifiedCount !== 1 && result.upsertedCount !== 1) {
                throw new Error(_t('core.update.permission.error', context.lang, {name: collectionName}))
            }

            newData = Object.keys(data).reduce((o, k) => {
                const item = data[k]
                if (k !== '_id' && item && item.constructor === ObjectId) {
                    o[k] = {_id: item}
                } else {
                    o[k] = item
                }
                return o
            }, {})
        }
        let createdBy
        if(newData.createdBy){
            if(newData.createdBy.constructor===Object){
                createdBy = Object.assign({username: ''},newData.createdBy)
            }else if(newData.createdBy.constructor===String){
                createdBy = {username: '',_id: new ObjectId(newData.createdBy)}
            }else{
                createdBy = {username: '',_id: newData.createdBy}
            }
        }else{
            createdBy = {
                _id:  new ObjectId(context.id),
                username: context.username
            }
        }
        console.log(createdBy)

        const returnValue = {
            ...newData,
            modifiedAt: dataSet.modifiedAt,
            createdBy: createdBy,
            status: 'updated'
        }

        if (_meta) {
            const meta = _meta.constructor===Object?_meta:JSON.parse(_meta)
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

        if(!await Util.userHasAccessRights(db,context,{typeName, access:'clone'})){
            throw new Error('Benutzer hat keine Berechtigung zum Kopieren')
        }

        let match = {_id: new ObjectId(_id)}
        if (!await Util.userHasCapability(db, context, CAPABILITY_MANAGE_TYPES)) {
            if (typeName === 'User') {
                throw new Error('Error cloning entry. You might not have premissions to manage other users')

            } else {
                match.createdBy = {$in: await Util.userAndJuniorIds(db, context.id)}
            }
        }

        Hook.call('enhanceTypeMatch', {type: typeName, context, match})

        const entry = await collection.findOne(match)

        if (!entry) {
            throw new Error('entry with id ' + _id + ' does not exist')
        }

        const clone = Object.assign({}, entry, {modifiedAt: null, _id:null, createdBy: new ObjectId(context.id)}, rest)

        if(clone.ownerGroup){
            // replace with current user ownerGroup
            clone.ownerGroup = context.group && context.group.length>0?context.group.map(g => new ObjectId(g)):null
        }

        delete clone._id

        const insertResult = await collection.insertOne(clone)
        if (insertResult.insertedId) {

            const result = {
                ...clone,
                _id: insertResult.insertedId,
                status: 'created',
                createdBy: {
                    _id: new ObjectId(context.id),
                    username: context.username
                }
            }

            await resolveReferences(typeName, result, db, context)

            Hook.call('typeCloned', {type: typeName, db, context})
            Hook.call('typeCloned_' + typeName, {db, context, result})

            return result
        }
    },
}

export default GenericResolver
