import {ObjectId} from 'mongodb'
import ClientUtil from '../../client/util/index.mjs'
import {getType} from '../../util/types.mjs'
import Util from './index.mjs'
import {CAPABILITY_MANAGE_SAME_GROUP} from '../../util/capabilities.mjs'

export const comparatorMap = {
    ':': '$regex',
    '=': '$regex',
    '=~': '$regex',
    '!~': '$regex', /* ~ ---> Alt+N */
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
                        ids.push(new ObjectId(id))
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
                filterValue = new ObjectId(filterValue)

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
                matchExpression = {
                    '$in': filterValue.substring(1, filterValue.length - 1).split(',').map(f=>{
                        if(f.startsWith('"') && f.endsWith('"')){
                            return f.slice(1, -1)
                        }
                        return f
                    })
                }
            } else {
                matchExpression = {[comparator]: filterValue}
            }
        }
    } else if (comparator === '$regex') {
        let $options, finalValue
        if(filterValue===undefined){
            filterValue = ''
        }

        if(filterValue.constructor!==String){
            // value must be a string
            filterValue = filterValue + ''
        }
        if(rawComperator.indexOf('~')>=0){
            const regParts = filterValue.match(/^\/(.*?)\/([gim]*)$/)
            if (regParts) {
                finalValue = new RegExp(regParts[1], regParts[2])
            } else {
                finalValue = new RegExp(filterValue)
            }
        }else {
            $options= 'i'
            finalValue = ClientUtil.escapeRegex(filterValue)
        }

        if (rawComperator.indexOf('!')>=0) {
            matchExpression = {$not: {[comparator]: finalValue}}
            if($options){
                matchExpression.$not.$options = $options
            }
        } else {
            matchExpression = {[comparator]: finalValue}
            if($options){
                matchExpression.$options = $options
            }
        }
    } else {
        matchExpression = {[comparator]: filterValue}
    }

    if (subQuery) {
        // execute sub query
        const ids = (await db.collection(subQuery.type).find({[subQuery.name]: matchExpression.$not ? matchExpression.$not : matchExpression}).toArray()).map(item => item._id)
        matchExpression = {[matchExpression.$not ? '$nin': '$in']: ids}
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

/*
This JavaScript code parses a search input string and converts it into a MongoDB query.
The search input string is expected to have a specific format, where each condition is separated by "&&" and each group of conditions is enclosed in parentheses,
with conditions within the group separated by "||". Each condition is in the format "field=value".
 */
const OPERATOR_MAP = {'||':'$or', '&&':'$and'}
const COMPERATOR_MAP = {'>':'$gt', '>=':'$gte', '<':'$lt', '<=':'$lte','=':'$regex','!=':'$regex','==':'$eq','!==':'$ne'}
export const addSearchStringToMatch = (inputString, query) => {
    let subQuery = query, inQuote = false, currTerm = '', comperator = '', operator ='', currField = '', parenthesisLevel = 0, parenthesisParents = {}, parenthesisOperator = {}

    const addToQuery =(mQuery = {})=>{
        const mOperator = OPERATOR_MAP[operator] || '$ukn'

        if(!subQuery[mOperator]){
            subQuery[mOperator] = []
        }
        if(mOperator !== '$ukn' && subQuery.$ukn){
            subQuery[mOperator].push(...subQuery.$ukn)
            delete subQuery.$ukn
        }
        subQuery[mOperator].push(mQuery)

        return mQuery
    }

    const pushCurrTerm = () => {
        if(!currField || !currTerm || !comperator){
            return
        }
        const comp = COMPERATOR_MAP[comperator] || '$eq'
        if(comp.startsWith('$lt')|| comp.startsWith('$gt')){
            currTerm = parseFloat(currTerm)
        }
        const mQuery = {[currField]:{[comp]:currTerm}}
        if(comp==='$regex'){
            // AND
            mQuery[currField][comp] = `^${mQuery[currField][comp].split(/\s/).map(f=>`(?=.*${f}.*)`).join('')}.*$`
            // OR
            //mQuery[currField][comp] = mQuery[currField][comp].replace(/\s/g, '|');
            mQuery[currField].$options = 'i'
        }
        addToQuery(mQuery)

        comperator= currField = currTerm = operator = ''
    }

    for (let i = 0; i < inputString.length; i++) {
        const char = inputString[i]
        if(char==='"'){
            inQuote = !inQuote
        }else if(!inQuote){
            if(char==='('){
                parenthesisOperator[parenthesisLevel] = operator
                parenthesisParents[parenthesisLevel] = subQuery
                parenthesisLevel++
                operator = ''
                subQuery = addToQuery()
            }else if(char===')'){
                pushCurrTerm()
                parenthesisLevel--
                operator = parenthesisOperator[parenthesisLevel]
                subQuery = parenthesisParents[parenthesisLevel]
                delete parenthesisParents[parenthesisLevel]
                delete parenthesisOperator[parenthesisLevel]
            }else if(['|','&'].indexOf(char)>=0){
                operator += char
            }else if(['=','<','>','!'].indexOf(char)>=0){
                comperator += char
            }else if(char==' '){
                pushCurrTerm()
            }else{
                if(comperator){
                    currTerm+=char
                }else{
                    currField+=char
                }
            }
        }else{
            currTerm+=char
        }
    }
    pushCurrTerm()
    if(query.$ukn){
        if(!query.$and){
            query.$and = []
        }
        query.$and.push(...query.$ukn)
        delete query.$ukn
    }

    return query
}



export const extendWithOwnerGroupMatch = (typeDefinition, context, match, userFilter) => {
    if (typeDefinition /* && context.role !== 'subscriber'*/) {
        // check for same ownerGroup
        const ownerGroup = typeDefinition.fields.find(f => f.name === 'ownerGroup')
        if (ownerGroup) {
            if(context.group && context.group.length > 0) {
                const ownerMatch = {ownerGroup: {$in: context.group.map(f => new ObjectId(f))}}
                if (match && Object.keys(match).length>0) {
                    match = {$or: [match, ownerMatch]}
                } else {
                    match = ownerMatch
                }
            }else if(!userFilter){
                if(!match) {
                    match = {}
                }
                match.ownerGroup= {}
            }
        }
    }
    return match
}


export const createMatchForCurrentUser = async ({typeName, db, context, operation}) => {
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


export const makeAllMatchAnAndMatch = (match) => {
    if (match) {
        // all the passed matches must be and
        Object.keys(match).forEach(k => {
            if (k === '$and') {
                return
            }
            match.$and.push({[k]: match[k]})
            delete match[k]
        })
    }
}