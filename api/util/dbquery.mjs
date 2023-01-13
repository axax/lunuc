import {ObjectId} from 'mongodb'

export const comparatorMap = {
    ':': '$regex',
    '=': '$regex',
    '==': '$eq',
    '===': '$eq',
    '>': '$gt',
    '>=': '$gte',
    '<': '$lt',
    '<=': '$lte',
    '!=': '$regex',
    '!==': '$ne'
}

export const addFilterToMatch = async ({db, debugInfo, filterKey, filterValue, type, subQuery, multi, filterOptions, match}) => {

    const rawComperator = filterOptions && filterOptions.comparator

    let comparator = '$regex' // default comparator

    if (rawComperator && comparatorMap[rawComperator]) {
        comparator = comparatorMap[rawComperator]
    }

    if (comparator === '$regex' && (type === 'Boolean' || type === 'ID' || type === 'Float')) {

        if (rawComperator === '!=') {
            comparator = '$ne'
        } else {
            comparator = '$eq'
        }
    }
    if (type === 'ID') {
        if (filterValue) {

            if (filterValue.constructor === ObjectId) {
                // do nothing
            } else if (filterValue.startsWith('[') && filterValue.endsWith(']')) {
                filterValue = filterValue.substring(1, filterValue.length - 1).split(',')
                const ids = []
                for (const id of filterValue) {
                    if (ObjectId.isValid(id)) {
                        ids.push(ObjectId(id))
                    } else {
                        if(debugInfo) {
                            debugInfo.push({
                                code: 'invalidId',
                                message: 'Search for IDs. But at least one ID is not valid'
                            })
                        }
                        return false
                    }
                }
                filterValue = ids
                if (comparator === '$ne') {
                    comparator = '$nin'
                } else {
                    comparator = '$in'
                }
            } else if (ObjectId.isValid(filterValue)) {
                // match by id
                filterValue = ObjectId(filterValue)

            } else {
                if(debugInfo) {
                    debugInfo.push({message: 'Search for ID. But ID is not valid', code: 'invalidId'})
                }
                return false
            }
        } else {

            if (comparator === '$ne') {
                if (!match.$and) {
                    match.$and = []
                }
                match.$and.push({
                    // Check about no Company key
                    [filterKey]: {
                        $exists: true,
                    },
                })
                match.$and.push({
                    // Check about no Company key
                    [filterKey]: {$ne: null},
                })
            } else {

                if (!match.$or) {
                    match.$or = []
                }
                match.$or.push({
                    // Check about no Company key
                    [filterKey]: {
                        $exists: false,
                    },
                })
                match.$or.push({
                    // Check about no Company key
                    [filterKey]: null,
                })
                match.$or.push({
                    // Check about no Company key
                    [filterKey]: {
                        $size: 0
                    },
                })
            }
            return true
        }
    } else if (type === 'Boolean') {
        if (filterValue === 'true' || filterValue === 'TRUE') {
            filterValue = true
        } else if (filterValue === 'false' || filterValue === 'FALSE') {
            filterValue = false
        }
    } else if (type === 'Float') {
        filterValue = parseFloat(filterValue)
    } else if (type === 'Object' && filterValue && db && db._versionInt >= 5) {
        filterValue = {
            body: `function(data) {return data && Object.keys(data).some(
                key => /${filterValue}/i.test( data[key] && (data[key].constructor===Object || data[key].constructor===Array)?JSON.stringify(data[key]):data[key])
                )}`,
            args: ['$' + filterKey],
            lang: 'js'
        }

        comparator = '$function'
        filterKey = '$expr'
    }

    let matchExpression
    if (['$gt', '$gte', '$lt', '$lte'].indexOf(comparator) >= 0) {
        matchExpression = {[comparator]: type === 'ID' ? filterValue : parseFloat(filterValue)}
    } else if (comparator === '$ne' || comparator === '$eq') {
        if (multi && filterValue && filterValue.constructor !== Array) {
            matchExpression = {[comparator === '$eq' ? '$in' : '$nin']: [filterValue]}
        } else if (filterValue === '') {
            matchExpression = {[comparator === '$eq' ? '$in' : '$nin']: [null, ""]}

            if (comparator !== '$eq') {
                // array must exist and must not be empty
                matchExpression.$exists = true
                matchExpression.$not = {$size: 0}
            }

        } else if (!filterOptions.inDoubleQuotes && filterValue === 'null') {
            matchExpression = {[comparator]: null}
        } else if (filterValue.constructor === ObjectId) {
            matchExpression = {[comparator]: filterValue}
        } else {
            if (filterOptions.inDoubleQuotes) {
                matchExpression = {[comparator]: filterValue}
            } else if (filterValue === true || filterValue === false) {
                matchExpression = {[comparator]: filterValue}
            } else if (!isNaN(filterValue)) {
                matchExpression = {[comparator]: parseFloat(filterValue)}
            } else if (filterValue && filterValue.constructor === String && filterValue.startsWith('[') && filterValue.endsWith(']')) {
                matchExpression = {'$in': filterValue.substring(1, filterValue.length - 1).split(',')}
            } else {
                matchExpression = {[comparator]: filterValue}
            }
        }
    } else if (comparator === '$regex') {
        if (rawComperator === '!=') {
            matchExpression = {$not: {[comparator]: filterValue, $options: 'i'}}
        } else {
            matchExpression = {[comparator]: filterValue, $options: 'i'}
        }
    } else {
        matchExpression = {[comparator]: filterValue}
    }

    if (subQuery) {
        // execute sub query
        const ids = (await db.collection(subQuery.type).find({[subQuery.name]: matchExpression}).toArray()).map(item => item._id)
        matchExpression = {$in: ids}
    }

    if (!filterOptions || filterOptions.operator === 'or') {
        if (!match.$or) {
            match.$or = []
        }
        match.$or.push({[filterKey]: matchExpression})
    } else {

        if (!match.$and) {
            match.$and = []
        }

        match.$and.push({[filterKey]: matchExpression})
    }
    return true
}