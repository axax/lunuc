import Util from '../../util'
//import Types form
import {ObjectId} from 'mongodb'
import {getFormFields, getType} from 'util/types'
import ClientUtil from 'client/util'
import config from 'gen/config'

const {DEFAULT_LANGUAGE} = config

const GenericResolver = {
    entities: async (db, context, collectionName, data, options) => {
        if (!context.lang) {
            throw new Error('lang on context is missing')
        }
        const startTime = new Date()
        const typeDefinition = getType(collectionName)|| {}

        //Util.checkIfUserIsLoggedIn(context)
        let {limit, offset, page, match, filter, sort, projectResult} = options
        if (!limit) {
            limit = 10
        }
        if (!offset) {

            if (page) {
                offset = (page - 1) * limit
            } else {
                offset = 0
            }
        }
        if (!page) {
            page = 1
        }

        // default match
        if (!match) {
            // if not specific match is defined, only select items that belong to the current user
            if (Util.userHasCapability(db, context, 'manage_types')) {
                match = {}

            } else {
                if (!typeDefinition.noUserRelation) {
                    match = {createdBy: ObjectId(context.id)}
                }
            }
        }


        if (!sort) {
            sort = {_id: -1}
        } else {
            if (sort.constructor === String) {
                // sort looks like "field1 asc, field2 desc"
                sort = sort.split(',').reduce((acc, val) => {
                    const a = val.split(' ')
                    return {...acc, [a[0]]: (a.length > 1 && a[1].toLowerCase() == "desc" ? -1 : 1)}
                }, {})
            }
        }
        const parsedFilter = ClientUtil.parseFilter(filter)
        const group = {}
        const lookups = []
        const afterSort = []
        const fields = getFormFields(collectionName)


        const addLookup = (type, fieldName, multi) => {

            const lookup = {
                $lookup: {
                    from: type,
                    localField: fieldName,
                    foreignField: '_id',
                    as: fieldName
                }
            }

            lookups.push(lookup)

            if (multi) {
                group[fieldName] = {'$first': '$' + fieldName}
            } else {
                group[fieldName] = {'$first': {$arrayElemAt: ['$' + fieldName, 0]}}
            }
        }

        const addFilterToMatch = (filterPart, filterKey, data) => {

            if (!filterPart || filterPart.operator === 'or') {
                if (!match.$or) {
                    match.$or = []
                }
                match.$or.push({[filterKey]: data})
            } else {
                match[filterKey] = data
            }

        }

        const addFilter = (value, isRef, localized) => {
            if (filter) {
                const filterKey = value + (localized ? '_localized.' + context.lang : '')
                const filterPart = parsedFilter.parts[value]
                if (filterPart) {
                    if (isRef) {
                        addFilterToMatch(filterPart, filterKey, ObjectId(filterPart.value))
                    } else {
                        if (filterPart.constructor === Array) {
                            filterPart.forEach(e => {
                                addFilterToMatch(e, filterKey, {'$regex': e.value, '$options': 'i'})
                            })
                        } else {
                            addFilterToMatch(filterPart, filterKey, {'$regex': filterPart.value, '$options': 'i'})
                        }
                    }
                }
                parsedFilter.rest.forEach(e => {
                    addFilterToMatch(e, filterKey, {'$regex': e.value, '$options': 'i'})
                })
            }
        }

        const projectResultData = {}
        const tempLocalizedMapRemoveWithMongo36 = []

        data.forEach((value, i) => {
            if (value.constructor === Object) {
                // if a value is in this format {'categories':['name']}
                // we expect that the field categories is a reference to another type
                // so we create a lookup for this type
                const keys = Object.keys(value)
                if (keys.length > 0) {
                    // there should be only one attribute
                    const key = keys[0]
                    //check if this field is a reference
                    if (fields && fields[key]) {
                        const field = fields[keys[0]]
                        addLookup(field.type, key, field.multi, value[key])


                        const lookupFields = getFormFields(field.type)
                        value[key].forEach(item => {
                            projectResultData[key + '.' + item] = 1

                            // TODO: remove with mongo 3.6 and use pipeline inside lookup instead
                            if( lookupFields[item] && lookupFields[item].localized ){
                                tempLocalizedMapRemoveWithMongo36.push({field:key, lookupField: item })
                                projectResultData[key + '.' + item+ '_localized.' + context.lang] = 1
                            }
                        })
                        addFilter(keys[0], true)

                    }

                }

            } else if (value.indexOf('$') > 0) {
                // this is a reference
                // for instance image$Media --> field image is a reference to the type Media
                const part = value.split('$')
                const fieldName = part[0]
                let type = part[1], multi = false
                if (type.startsWith('[')) {
                    multi = true
                    type = type.substring(1, type.length - 1)
                }
                addLookup(type, fieldName, multi)
                addFilter(fieldName, true)
                projectResultData[fieldName] = 1

            } else {
                // regular field
                if (value !== '_id') {
                    if (fields && fields[value] && fields[value].localized) {
                        group[value] = {'$first': '$' + value + '_localized.' + context.lang}
                        addFilter(value, false, true)
                    } else {
                        group[value] = {'$first': '$' + value}
                        addFilter(value)
                    }
                }
                projectResultData[value] = 1

            }
        })
        if (parsedFilter && parsedFilter.parts._id) {
            // if there is a filter on _id
            // handle it here
            addFilterToMatch(parsedFilter.parts._id, '_id', ObjectId(parsedFilter.parts._id.value))
            //match._id =ObjectId(parsedFilter.parts._id.value)
        }

        if (projectResult) {
            // also remove id if it is not wanted
            if (!projectResultData._id) {
                projectResultData._id = 0
            }
            afterSort.push({$project: projectResultData})
        }else{
            // also return extra fields
            if (!typeDefinition.noUserRelation) {
                lookups.push({
                    $lookup: {
                        from: 'User',
                        localField: 'createdBy',
                        foreignField: '_id',
                        as: 'createdBy'
                    }
                })
                group.createdBy = {'$first': {$arrayElemAt: ['$createdBy', 0]}} // return as as single doc not an array
            }
            group.modifiedAt = {'$first': '$modifiedAt'}
        }

        const collection = db.collection(collectionName)
        const startTimeAggregate = new Date()
        let a = (await collection.aggregate([
            {
                $match: match
            },
            ...lookups,
            // Group back to arrays
            {
                $group: {
                    _id: '$_id',
                    ...group
                }
            },
            {$sort: sort},
            ...afterSort,
            {
                //TODO maybe it is better to use facet for pagination
                $group: {
                    _id: null,
                    // get a count of every result that matches until now
                    total: {$sum: 1},
                    // keep our results for the next operation
                    results: {$push: '$$ROOT'}
                }
            },
            // and finally trim the results to within the range given by start/endRow
            {
                $project: {
                    total: 1,
                    results: {$slice: ['$results', offset, limit]}
                }
            },
            // return offset and limit
            {
                $addFields: {limit, offset, page}
            }
        ]).toArray())
        if (a.length === 0) {
            return {
                aggregateTime: new Date() - startTimeAggregate,
                page,
                limit,
                offset,
                total: 0,
                results: null
            }
        }
        a[0].aggregateTime = new Date() - startTimeAggregate


        // TODO: remove with mongo 3.6 and use pipeline inside lookup instead
        if( tempLocalizedMapRemoveWithMongo36.length && a[0].results){
            a[0].results.forEach(record => {
                tempLocalizedMapRemoveWithMongo36.forEach(item=>{
                    if( record[item.field].constructor === Array){
                        record[item.field].forEach( subItem => {
                            subItem[item.lookupField] = subItem[item.lookupField+'_localized'][context.lang]
                        })
                    }else{
                        record[item.field][item.lookupField] = record[item.field][item.lookupField+'_localized'][context.lang]
                    }
                })
            })
        }
        console.log(`GenericResolver for ${collectionName} complete: aggregate time = ${a[0].aggregateTime}ms total time ${new Date() - startTime}ms`)
        return a[0]
    },
    createEnity: async (db, context, collectionName, data) => {
        Util.checkIfUserIsLoggedIn(context)

        if (!context.lang) {
            throw new Error('lang on context is missing')
        }
        let createdBy, username
        console.log(data)
        if( data.createdBy && data.createdBy !== context.id ){
            await Util.checkIfUserHasCapability(db, context, 'manage_other_users')
            createdBy = data.createdBy

            // TODO: resolve username
            username = data.createdBy
        }else{
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
                        a.push({_id});
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
    deleteEnity: async (db, context, collectionName, data) => {

        Util.checkIfUserIsLoggedIn(context)


        const collection = db.collection(collectionName)

        if (!data._id) {
            throw new Error('Id is missing')
        }

        const deletedResult = await collection.deleteOne({
            _id: ObjectId(data._id)
        })

        if (deletedResult.deletedCount) {
            return {
                _id: data._id,
                status: 'deleted'
            }
        } else {
            return {
                _id: data._id,
                status: 'error'
            }
        }
    },
    updateEnity: async (db, context, collectionName, data) => {

        Util.checkIfUserIsLoggedIn(context)

        const collection = db.collection(collectionName)

        //check if this field is a reference
        const fields = getFormFields(collectionName)


        // we create also a dataSet with dot notation format for partial update
        const dataSetDotNotation = {}

        // clone object but without _id and undefined property
        // keep null values to remove references
        const dataSet = Object.keys(data).reduce((o, k) => {
            if (k !== '_id' && data[k] !== undefined) {

                if (fields && fields[k] && fields[k].localized) {
                    // is field localized
                    if (!o[k + '_localized'])
                        o[k + '_localized'] = {}
                    o[k + '_localized'][context.lang] = data[k]
                    dataSetDotNotation[k + '_localized.' + e] = data[k][e]
                } else if (k.endsWith('_localized')) {
                    // if a localized object {_localized:{de:'',en:''}} gets passed
                    // convert it to the format _localized.de='' and _localized.en=''
                    if (data[k]) {

                        Object.keys(data[k]).map(e => {
                            if (!o[k])
                                o[k] = {}
                            o[k][e] = data[k][e]
                            dataSetDotNotation[k + '.' + e] = data[k][e]
                        })
                    }

                } else {
                    o[k] = data[k]
                    dataSetDotNotation[k] = data[k]
                }
            }
            return o
        }, {})

        // set timestamp
        dataSet.modifiedAt = dataSetDotNotation.modifiedAt = new Date().getTime()

        // try with dot notation for partial update
        let result = (await collection.findOneAndUpdate({_id: ObjectId(data._id)}, {
            $set: dataSetDotNotation
        }, {returnOriginal: false}))

        if (result.ok !== 1) {
            // if it fails try again without dot notation
            result = (await collection.findOneAndUpdate({_id: ObjectId(data._id)}, {
                $set: dataSet
            }, {returnOriginal: false}))
        }


        if (result.ok !== 1) {
            throw new ApiError(collectionName + ' could not be changed')
        }
        return {
            ...data,
            modifiedAt: dataSet.modifiedAt,
            createdBy: {
                _id: ObjectId(context.id),
                username: context.username
            },
            status: 'updated'
        }
    },
    cloneEntity: async (db, context, collectionName, {_id, ...rest}) => {

        Util.checkIfUserIsLoggedIn(context)

        console.log(_id, rest)
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

            return {
                ...clone,
                _id: doc._id,
                status: 'created',
                createdBy: {
                    _id: ObjectId(context.id),
                    username: context.username
                }
            }
        }
    },
}

export default GenericResolver