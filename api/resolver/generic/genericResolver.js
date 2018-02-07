import Util from '../../util'
//import Types form
import {ObjectId} from 'mongodb'
import {getFormFields} from 'util/types'


const GenericResolver = {
    entities: async (db, context, collectionName, data, options) => {

        //Util.checkIfUserIsLoggedIn(context)


        let {limit, offset, page, match, filter, sort} = options

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

        if (!match) {
            // if not specific match is defined, only select items that belong to the current user
            match = {createdBy: ObjectId(context.id)}
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

        const filterParts = {
            $:[]
        }
        /* price=99 name=a
           -->


         */
        if( filter ){
            const a = filter.split(' ')
            a.forEach(i => {
                const p = i.split('=')
                if( p.length>1 ){
                    filterParts[ p[0] ] = p[1]
                }else{
                    filterParts.$.push(p[0])
                }
            })
        }


        const group = {}
        const filterMatch = []
        const lookups = []

        const addLookup = (type,fieldName,multi)=>{
            lookups.push({
                $lookup: {
                    from: type,
                    localField: fieldName,
                    foreignField: '_id',
                    as: fieldName
                }
            })

            if (multi) {
                group[fieldName] = {'$first': '$' + fieldName}
            } else {
                group[fieldName] = {'$first': {$arrayElemAt: ['$' + fieldName, 0]}}
            }
        }

        data.forEach((value, i) => {

            if( value.constructor === Object ){
                // if a value is in this format {'categories':['name']}
                // we expect that the field categories is a reference to another type
                // so we create a lookup for this type
                const keys = Object.keys(value)
                //check if this field is a reference
                const fields = getFormFields(collectionName)
                if( fields && fields[keys[0]] ){
                    addLookup(fields[keys[0]].type,keys[0],fields[keys[0]].multi)
                }
            }else if (value.indexOf('$') > 0) {
                // this is a reference
                // for instance image$Media --> field image is a reference to the type Media

                const part = value.split('$')
                const fieldName = part[0]
                let type = part[1], multi = false
                if (type.startsWith('[')) {
                    multi = true
                    type = type.substring(1, type.length - 1)
                }
                addLookup(type,fieldName,multi)

            } else {
                group[value] = {'$first': '$' + value}


                if( filter ) {
                    if (filterParts[value]) {
                        filterMatch.push({[value]: {'$regex': filterParts[value], '$options': 'i'}})
                    }
                    filterParts.$.forEach(i => {
                        filterMatch.push({[value]: {'$regex': i, '$options': 'i'}})
                    })
                }
            }


        })
        if (filterMatch.length > 0) {
            match.$or = filterMatch
        }
        console.log(match)

        const collection = db.collection(collectionName)

        let a = (await collection.aggregate([
            {
                $match: match
            },
            {
                $lookup: {
                    from: 'User',
                    localField: 'createdBy',
                    foreignField: '_id',
                    as: 'createdBy'
                }
            },
            ...lookups,
            // Group back to arrays
            {
                $group: {
                    _id: '$_id',
                    ...group,
                    createdBy: {'$first': {$arrayElemAt: ['$createdBy', 0]}}, // return as as single doc not an array
                }
            },
            {$sort: sort},
            {
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
                $addFields: {limit, offset}
            }
        ]).toArray())

        if (a.length === 0) {
            return {
                limit,
                offset,
                total: 0,
                results: null
            }
        }
        return a[0]
    },
    createEnity: async (db, context, collectionName, data) => {
        Util.checkIfUserIsLoggedIn(context)

        const collection = db.collection(collectionName)
        const insertResult = await collection.insertOne({
            ...data,
            createdBy: ObjectId(context.id)
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
                    _id: ObjectId(context.id),
                    username: context.username
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


        // clone object but without _id and undefined property
        // keep null values to remove references
        const dataSet = Object.keys(data).reduce((o, k) => {
            if (k !== '_id' && data[k]!==undefined ) {
                o[k] = data[k]
            }
            return o
        }, {})


        const result = (await collection.findOneAndUpdate({_id: ObjectId(data._id)}, {
            $set: dataSet
        }, {returnOriginal: false}))
        if (result.ok !== 1) {
            throw new ApiError(collectionName + ' could not be changed')
        }
        return {
            ...data,
            createdBy: {
                _id: ObjectId(context.id),
                username: context.username
            },
            status: 'updated'
        }
    }
}

export default GenericResolver