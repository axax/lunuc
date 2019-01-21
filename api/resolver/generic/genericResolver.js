import Util from '../../util'
//import Types form
import {ObjectId} from 'mongodb'
import {getFormFields, getType} from 'util/types'
import ClientUtil from 'client/util'
import config from 'gen/config'
import {
    CAPABILITY_MANAGE_TYPES,
    CAPABILITY_MANAGE_OTHER_USERS
} from 'util/capabilities'
import Hook from 'util/hook'

const {DEFAULT_LANGUAGE} = config

const buildCollectionName = async (db, context, typeName, version) => {

    if (!version) {
        const values = await Util.keyValueGlobalMap(db, context, ['TypesSelectedVersions'])
        if (values && values['TypesSelectedVersions']) {
            version = values['TypesSelectedVersions'][typeName]
        }
    }

    return typeName + (version && version !== 'default' ? '_' + version : '')
}


//TODO create a class for building the aggregate class
class AggregationBuilder {

    constructor(type, fields, options) {
        this.type = type
        this.fields = fields
        this.options = options
    }

    getLimit() {
        let {limit} = this.options
        return limit ? limit : 10
    }

    getOffset() {
        let {offset, page} = this.options

        if (!offset) {

            if (page) {
                return (page - 1) * this.getLimit()
            } else {
                return 0
            }
        }

        return offset
    }

    getPage() {
        let {page} = this.options

        if (!page) {
            return 1
        }

        return page
    }

    getSort() {
        let {sort} = this.options
        if (!sort) {
            return {_id: -1}
        } else {
            if (sort.constructor === String) {
                // sort looks like "field1 asc, field2 desc"
                return sort.split(',').reduce((acc, val) => {
                    const a = val.split(' ')
                    return {...acc, [a[0]]: (a.length > 1 && a[1].toLowerCase() == "desc" ? -1 : 1)}
                }, {})
            }
        }
        return sort
    }


    // Mongodb joins
    createAndAddLookup({type, fieldName, multi, lookups}) {
        const match = {
            $expr: {
                [multi ? '$in' : '$eq']: ['$_id', '$$' + fieldName]
            }
        }
        /* let hasFilter = false
         const parsedFilter = this.getParsedFilter()
         if (parsedFilter) {
         const filterPart = parsedFilter.parts[fieldName]
         if (filterPart) {
         hasFilter = true
         match.$expr = {$and: [{$eq: ['$_id', ObjectId(filterPart.value)]}, match.$expr]}
         }
         }*/

        /* with pipeline */
        const lookup = {
            $lookup: {
                from: type,
                as: fieldName,
                let: {
                    [fieldName]: '$' + fieldName
                },
                pipeline: [
                    {
                        $match: match
                    }
                ]
            }
        }

        lookups.push(lookup)
        /*if (hasFilter) {
         lookups.push({
         $match: {
         $expr: {['$' + fieldName]: {$exists: true, $not: {$size: 0}}}
         }
         })
         }*/
        return {lookup}
    }

    createGroup(fieldName, multi) {
        return {'$first': multi ? '$' + fieldName : {$arrayElemAt: ['$' + fieldName, 0]}}
    }


    getParsedFilter() {
        if (!this._parsedFilter) {
            const {filter} = this.options
            if (filter) {
                this._parsedFilter = ClientUtil.parseFilter(filter)
            }
        }
        return this._parsedFilter
    }

    // filter where clause
    createAndAddFilterToMatch({fieldName, reference, localized, match}) {
        const parsedFilter = this.getParsedFilter()
        if (parsedFilter) {
            const {lang} = this.options
            const filterPart = parsedFilter.parts[fieldName]
            const filterKey = fieldName + (localized ? '_localized.' + lang : '')
            if (filterPart) {
                if (reference) {
                    if (filterPart.value) {
                        if (ObjectId.isValid(filterPart.value)) {
                            // match by id
                            this.addFilterToMatch({
                                filterKey,
                                filterValue: ObjectId(filterPart.value),
                                filterOptions: filterPart,
                                match
                            })
                        }

                    }
                } else {
                    if (filterPart.constructor === Array) {
                        filterPart.forEach(e => {
                            this.addFilterToMatch({
                                filterKey,
                                filterValue: {'$regex': e.value, '$options': 'i'},
                                filterOptions: e,
                                match
                            })
                        })
                    } else {
                        this.addFilterToMatch({
                            filterKey,
                            filterValue: {
                                '$regex': filterPart.value,
                                '$options': 'i'
                            }, filterOptions: filterPart, match
                        })
                    }
                }
            }


            if (!reference) {
                parsedFilter.rest.forEach(e => {
                    this.addFilterToMatch({
                        filterKey,
                        filterValue: {'$regex': e.value, '$options': 'i'},
                        filterOptions: e,
                        match
                    })
                })
            }
        }
    }


    addFilterToMatch({filterKey, filterValue, filterOptions, match}) {
        if (!filterOptions || filterOptions.operator === 'or') {
            if (!match.$or) {
                match.$or = []
            }
            match.$or.push({[filterKey]: filterValue})
        } else {
            match[filterKey] = filterValue
        }
    }

    query() {
        const typeDefinition = getType(this.type) || {}

        const {projectResult, lang} = this.options

        // limit and offset
        const limit = this.getLimit(),
            offset = this.getOffset(),
            page = this.getPage(),
            sort = this.getSort(),
            typeFields = getFormFields(this.type),
            parsedFilter = this.getParsedFilter()

        let rootMatch = Object.assign({}, this.options.match),
            match = {},
            groups = {},
            lookups = [],
            projectResultData = {},
            hasMatchInReference = false


        // if there is filter like _id=12323213
        if (parsedFilter && parsedFilter.parts._id) {
            // if there is a filter on _id
            // handle it here
            this.addFilterToMatch({
                filterKey: '_id',
                filterValue: ObjectId(parsedFilter.parts._id.value),
                filterOptions: parsedFilter.parts._id,
                rootMatch
            })
        }


        this.fields.forEach((field, i) => {
            if (field.constructor === Object) {
                // if a value is in this format {'categories':['name']}
                // we expect that the field categories is a reference to another type
                // so we create a lookup for this type

                const fieldNames = Object.keys(field)
                if (fieldNames.length > 0) {

                    // there should be only one attribute
                    const fieldName = fieldNames[0]

                    //check if this field is a reference
                    if (typeFields && typeFields[fieldName]) {
                        const typeField = typeFields[fieldName]

                        // create lookup and group value for pipeline
                        const {lookup} = this.createAndAddLookup({
                            type: typeField.type,
                            fieldName,
                            multi: typeField.multi,
                            lookups
                        })
                        const group = this.createGroup(fieldName, typeField.multi)

                        // get fields of the referenced type
                        const lookupFields = getFormFields(typeField.type)

                        // projection
                        const projectPipeline = {}

                        field[fieldName].forEach(item => {
                            projectResultData[fieldName + '.' + item] = 1
                            if (lookupFields[item] && lookupFields[item].localized) {
                                projectPipeline[item + '_localized.' + lang] = 1

                                // project localized field in current language
                                projectPipeline[item] = '$' + item + '_localized.' + lang
                                //projectResultData[key + '.' + item + '_localized.' + lang] = 1
                            } else {
                                projectPipeline[item] = 1
                            }

                            if (fieldName !== '_id') {
                                hasMatchInReference = true
                                this.createAndAddFilterToMatch({
                                    fieldName: fieldName + '.' + item,
                                    reference: false,
                                    localized: false,
                                    match
                                })
                            }

                        })

                        lookup.$lookup.pipeline.push({$project: projectPipeline})

                        // add group
                        groups[fieldName] = group

                        this.createAndAddFilterToMatch({
                            fieldName,
                            reference: true,
                            localized: false,
                            match: rootMatch
                        })

                    }

                }

            } else if (field.indexOf('$') > 0) {
                // this is a reference
                // for instance image$Media --> field image is a reference to the type Media
                const part = field.split('$')
                const fieldName = part[0]
                let type = part[1], multi = false
                if (type.startsWith('[')) {
                    multi = true
                    type = type.substring(1, type.length - 1)
                }

                this.createAndAddLookup({type, fieldName, multi, lookups})
                groups[fieldName] = this.createGroup(fieldName, multi)
                this.createAndAddFilterToMatch({fieldName, reference: true, localized: false, match})
                projectResultData[fieldName] = 1

            } else {
                // regular field
                if (field !== '_id') {
                    if (typeFields && typeFields[field] && typeFields[field].localized) {
                        groups[field] = {'$first': '$' + field + '_localized.' + lang}
                        this.createAndAddFilterToMatch({
                            fieldName: field,
                            reference: false,
                            localized: true,
                            match
                        })
                    } else {
                        groups[field] = {'$first': '$' + field}
                        this.createAndAddFilterToMatch({
                            fieldName: field,
                            reference: false,
                            localized: false,
                            match
                        })
                    }
                }
                projectResultData[field] = 1

            }
        })

        if (!projectResult) {
            // also return extra fields
            if (!typeDefinition.noUserRelation) {

                this.createAndAddLookup({type: 'User', fieldName: 'createdBy', multi: false, lookups})
                groups.createdBy = this.createGroup('createdBy', false)
            }
            groups.modifiedAt = {'$first': '$modifiedAt'}
        }


        // compose result
        const result = []


        if (Object.keys(rootMatch).length > 0) {

            if (!hasMatchInReference) {
                result.push({
                    $match: {...rootMatch, ...match}
                })
            } else {
                result.push({
                    $match: rootMatch
                })
            }
        } else if (!hasMatchInReference) {
            result.push({
                $match: match
            })
        }

        if (lookups.length > 0) {
            for (const lookup of lookups) {
                result.push(lookup)
            }
        }

        // Group back to arrays
        result.push(
            {
                $group: {
                    _id: '$_id',
                    ...groups
                }
            })

        // second match
        if (hasMatchInReference) {
            result.push({
                $match: match
            })
        }

        // add sort
        result.push({$sort: sort})

        // project
        if (projectResult) {
            // also remove id if it is not explicitly set
            if (!projectResultData._id) {
                projectResultData._id = 0
            }
            result.push({$project: projectResultData})
        }

        //pagination
        //TODO maybe it is better to use facet for pagination
        result.push({
            $group: {
                _id: null,
                // get a count of every result that matches until now
                total: {$sum: 1},
                // keep our results for the next operation
                results: {$push: '$$ROOT'}
            }
        })

        // and finally trim the results to within the range given by start/endRow
        result.push({
            $project: {
                total: 1,
                results: {$slice: ['$results', offset, limit]}
            }
        })

        // return offset and limit
        result.push({
            $addFields: {limit, offset, page}
        })

        return result

    }

}

const GenericResolver = {
    entities: async (db, context, typeName, data, options) => {
        if (!context.lang) {
            throw new Error('lang on context is missing')
        }
        const startTime = new Date()

        let {match, version, ...otherOptions} = options

        const collectionName = await buildCollectionName(db, context, typeName, version)

        // Default match
        if (!match) {
            // if not specific match is defined, only select items that belong to the current user
            if (Util.userHasCapability(db, context, CAPABILITY_MANAGE_TYPES)) {
                match = {}

            } else {
                if (!typeDefinition.noUserRelation) {
                    match = {createdBy: ObjectId(context.id)}
                }
            }
        }

        const aggregationBuilder = new AggregationBuilder(typeName, data, {match, lang: context.lang, ...otherOptions})

        const aggregationQuery = aggregationBuilder.query()

        console.log(JSON.stringify(aggregationQuery, null, 4))

        const collection = db.collection(collectionName)
        const startTimeAggregate = new Date()
        let a = (await collection.aggregate(aggregationQuery).toArray())
        if (a.length === 0) {
            return {
                aggregateTime: new Date() - startTimeAggregate,
                page: aggregationBuilder.getPage(),
                limit: aggregationBuilder.getLimit(),
                offset: aggregationBuilder.getOffset(),
                total: 0,
                results: null
            }
        }

        a[0].aggregateTime = new Date() - startTimeAggregate

        console.log(`GenericResolver for ${collectionName} complete: aggregate time = ${a[0].aggregateTime}ms total time ${new Date() - startTime}ms`)
        return a[0]
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


        // we create also a dataSet with dot notation format for partial update
        const dataSetDotNotation = {}

        // clone object but without _id and undefined property
        // keep null values to remove references
        const dataSet = Object.keys(data).reduce((o, k) => {
            if (k !== '_id' && k !== '_version' && data[k] !== undefined) {

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
        let result = (await collection.findOneAndUpdate(params, {
            $set: dataSetDotNotation
        }, {returnOriginal: false}))

        if (result.ok !== 1) {
            // if it fails try again without dot notation
            result = (await collection.findOneAndUpdate(params, {
                $set: dataSet
            }, {returnOriginal: false}))
        }
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