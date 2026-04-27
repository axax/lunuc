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
import AggregationBuilderV2 from './AggregationBuilderV2.mjs'
import AggregationBuilder from './AggregationBuilder.mjs'
import Cache from '../../../util/cache.mjs'
import {_t} from '../../../util/i18nServer.mjs'
import {createMatchForCurrentUser} from '../../util/dbquery.mjs'
import postQueryConvert from './postQueryConverter.mjs'

// ─── helpers (module-level, not inside the method) ──────────────────────────

function resolveRequestContext(reqOrContext) {
    if (reqOrContext.context && !reqOrContext.session) {
        return { context: reqOrContext.context, req: reqOrContext }
    }
    return { context: reqOrContext, req: {} }
}

function parseCacheOptions(cache) {
    if (!cache || cache === false) return null

    if (cache === true)  return { cacheTime: 300000, cacheKey: null, cachePolicy: null }
    if (!isNaN(cache))   return { cacheTime: cache,   cacheKey: null, cachePolicy: null }

    // Object form
    if (cache.if === 'false' || cache.if === false) return null
    return {
        cacheTime:   cache.expires === undefined ? 60000 : cache.expires,
        cacheKey:    cache.key    || null,
        cachePolicy: cache.policy || null,
    }
}

const isDeepEqualUnordered = (a, b) => {
    // 1. Einfache Typen direkt vergleichen
    if (a === b) return true;

    // 2. Falls Typen unterschiedlich oder null, direkt false
    if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
        return false;
    }

    // 3. Arrays verarbeiten
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;

        // Trick: Jedes Element in 'a' muss ein Gegenstück in 'b' finden
        // Wir kopieren b, um gefundene Übereinstimmungen zu markieren
        const bCopy = [...b];
        return a.every(itemA => {
            const indexB = bCopy.findIndex(itemB => isDeepEqualUnordered(itemA, itemB));
            if (indexB !== -1) {
                bCopy.splice(indexB, 1); // Element "verbrauchen"
                return true;
            }
            return false;
        });
    }

    // 4. Normale Objekte verarbeiten
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) return false;

    return keysA.every(key =>
        Object.prototype.hasOwnProperty.call(b, key) &&
        isDeepEqualUnordered(a[key], b[key])
    );
};


const buildCollectionName = async (db, context, typeName, _version) => {

    if (!_version) {
        const values = await Util.keyValueGlobalMap(db, context, ['TypesSelectedVersions'])
        if (values && values['TypesSelectedVersions']) {
            _version = values['TypesSelectedVersions'][typeName]
        }
    }

    return typeName + (_version && _version !== 'default' ? '_' + _version : '')
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
        const { context, req } = resolveRequestContext(reqOrContext)

        if (!context.lang) throw new Error('lang on context is missing')

        const startTime = performance.now()

        const {
            match: matchOption,
            _version,
            cache,
            includeCount,
            postConvert,
            aggregateOptions,
            aggregationBuilderOptions,
            graphqlInfo,
            ...otherOptions
        } = options

        const collectionName = await buildCollectionName(db, context, typeName, _version)
        const userCanManageOtherUsers = await Util.userHasCapability(db, context, CAPABILITY_MANAGE_OTHER_USERS)

        // ── resolve match ──────────────────────────────────────────────────────
        let match = matchOption
        if (!match) {
            match = userCanManageOtherUsers
                ? {}
                : await createMatchForCurrentUser({ typeName, db, context })

            if (!match) throw new Error(`no permission to read data for type ${typeName}`)
        }

        Hook.call('enhanceTypeMatch', { type: typeName, context, match })

        // ── cache (read) ───────────────────────────────────────────────────────
        const cacheOpts = parseCacheOptions(cache)
        let cacheKey = null

        if (cacheOpts && !isNaN(cacheOpts.cacheTime) && cacheOpts.cacheTime > 0) {
            cacheKey = cacheOpts.cacheKey ?? (
                collectionName
                + (context.id || '')
                + (Object.keys(match).length > 0 ? JSON.stringify(match) : '')
                + context.lang
                + JSON.stringify(otherOptions)
            )

            if (cacheOpts.cachePolicy !== 'cache-only') {
                const cached = Cache.get(cacheKey)
                if (cached) {
                    console.debug(`GenericResolver: from cache for ${collectionName} complete: total time ${Math.round(performance.now() - startTime)}ms`)
                    return cached
                }
            }
        }

        // ── hooks: before load ─────────────────────────────────────────────────
        await HookAsync.call('beforeTypeLoaded', { type: typeName, db, req, context, otherOptions, match, data })

        // ── build aggregation ──────────────────────────────────────────────────
        const estimateCount = includeCount !== false && !options.filter && Object.keys(match).length === 0
        const finalAggregateOptions = { allowDiskUse: true, ...aggregateOptions }

        if (
            !finalAggregateOptions.collation &&
            otherOptions?.sort?.constructor === String &&
            otherOptions.sort.startsWith('$')
        ) {
            otherOptions.sort = otherOptions.sort.substring(1)
            finalAggregateOptions.collation = { locale: context.lang }
        }

        otherOptions.limitCount = 10000

        const finalAggregationBuilderOptions =
            aggregationBuilderOptions
            ?? (await Util.getKeyValueGlobal(db, null, 'AggregationBuilderOptions', true))
            ?? {}

        const builderArgs = [typeName, data, db, {
            match,
            includeCount: includeCount !== false && !estimateCount,
            lang: context.lang,
            includeUserFilter: userCanManageOtherUsers,
            ...otherOptions,
        }]

        const isV2 = finalAggregationBuilderOptions.version === 2
        const aggregationBuilder = isV2
            ? new AggregationBuilderV2(...builderArgs)
            : new AggregationBuilder(...builderArgs)

        const { dataQuery, countQuery, debugInfo } = await aggregationBuilder.query()

        // ── optional version-diff logging ──────────────────────────────────────
        if (finalAggregationBuilderOptions.logVersionDif) {
            const altBuilder = isV2
                ? new AggregationBuilder(...builderArgs)
                : new AggregationBuilderV2(...builderArgs)

            const { dataQuery: altDataQuery } = await altBuilder.query()

            if (!isDeepEqualUnordered(dataQuery, altDataQuery)) {
                console.log('Query of V2 Version is different')
                await GenericResolver.createEntity(db, { context }, 'Log', {
                    location: 'aggregationBuilder',
                    type:     'v2different',
                    message:  'Query of V2 Version is different',
                    meta: {
                        version:    finalAggregationBuilderOptions.version,
                        dataQuery,
                        dataQuery2: altDataQuery,
                        otherOptions,
                    },
                })
            }
        }

        // ── run aggregate ──────────────────────────────────────────────────────
        const collection = db.collection(collectionName)
        const startTimeAggregate = performance.now()
        const results = await collection.aggregate(dataQuery, finalAggregateOptions).toArray()

        let result
        if (results.length === 0) {
            result = {
                page:    aggregationBuilder.getPage(),
                limit:   aggregationBuilder.getLimit(),
                offset:  aggregationBuilder.getOffset(),
                total:   0,
                results: null,
            }
        } else if (postConvert === false) {
            result = results[0]
        } else {
            result = await postQueryConvert(results[0], { typeName, db, context, graphqlInfo })
        }

        // ── resolve total count ────────────────────────────────────────────────
        if (result.total === undefined) {
            if (result.count?.length > 0) {
                result.total = result.count[0].count + (otherOptions.limitCount ? result.offset : 0)
            } else {
                result.total = estimateCount ? await collection.estimatedDocumentCount() : 0

                if (results.length > result.total) {
                    console.log('estimatedDocumentCount is not accurate', result.total, results.length)
                    const countResults = await collection.aggregate(countQuery, { allowDiskUse: true }).toArray()
                    if (countResults.length > 0) result.total = countResults[0].count
                }
            }
        }
        delete result.count

        // ── timing ─────────────────────────────────────────────────────────────
        const aggregateTime = Math.round(performance.now() - startTimeAggregate)
        const totalTime     = Math.round(performance.now() - startTime)

        // ── hooks: after load ──────────────────────────────────────────────────
        await HookAsync.call('typeLoaded', {
            type: typeName, cacheKey, data, db, req, context,
            otherOptions, result, dataQuery, collectionName, aggregateTime, debugInfo,
        })

        // ── meta ───────────────────────────────────────────────────────────────
        if (otherOptions.returnMeta !== false) {
            result.meta = {
                ...(result.meta ?? {}),
                aggregateTime,
                totalTime,
                debugInfo,
            }
        }

        if (result.meta) result.meta = JSON.stringify(result.meta)

        // ── cache (write) ──────────────────────────────────────────────────────
        if (cacheKey) Cache.set(cacheKey, result, cacheOpts.cacheTime)

        console.debug(`GenericResolver: for ${collectionName} complete: aggregate time = ${aggregateTime}ms total time ${totalTime}ms`)
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

        if(!skipCheck) {
            Util.checkIfUserIsLoggedIn(userContext)
        }

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
            } else if(fields[k] && fields[k].hash && data[k]){
                o[k] =Util.hashPassword(data[k])
            } else {
                o[k] = data[k]
            }
            return o
        }, {})

        let lastEntry
        for (const [fieldName, field] of Object.entries(fields)) {
            if(field.copyLastValue && dataSet[fieldName]===null){
                if(!lastEntry) {
                    let match
                    if (await Util.userHasCapability(db, context, CAPABILITY_MANAGE_OTHER_USERS)) {
                        match = {}
                    } else {
                        match = await createMatchForCurrentUser({typeName, db, context})
                    }
                    const lastEntryArray = await db.collection(typeName).find(match).sort({_id: 1}).limit(1).toArray()
                    if(lastEntryArray.length>0){
                        lastEntry = lastEntryArray[0]
                    }
                }
                if(lastEntry){
                    dataSet[fieldName] = lastEntry[fieldName]
                }
            }
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


        if (Hook.hooks['typeBeforeDelete'] && Hook.hooks['typeBeforeDelete'].length) {
            for (let i = 0; i < Hook.hooks['typeBeforeDelete'].length; ++i) {
                await Hook.hooks['typeBeforeDelete'][i].callback({db, type: typeName, data})
            }
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

        const returnValue = {
            ...newData,
            modifiedAt: dataSet.modifiedAt,
            createdBy: createdBy,
            status: 'updated'
        }
        if(context.id) {
            Cache.clearStartWith(collectionName+context.id)
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
