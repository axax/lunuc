import extensions from '../gensrc/extensions.mjs'
import Hook from './hook.cjs'
import config from '../gensrc/config-client.js'

const {LANGUAGES} = config

const TYPENAME = '__typename'

export const types = {}, typeQueries = {}

// clears the cached types and queries -> the next getTypes() builds them again
// (used by typesAdmin.mjs after the full type definitions have been merged in)
export const resetTypes = () => {
    Object.keys(types).forEach(key => delete types[key])
    Object.keys(typeQueries).forEach(key => delete typeQueries[key])
}

export const getTypes = () => {
    if (Object.keys(types).length === 0) {
        //  create types object only once
        for (const extensionName in extensions) {
            const extension = extensions[extensionName]
            if (extension.options && extension.options.types) {

                extension.options.types.forEach(type => {
                    types[type.name] = Object.assign({}, type)
                    // add extension name so we know by which extension the type is used
                    if (!types[type.name].usedBy) {
                        types[type.name].usedBy = []
                    }
                    types[type.name].usedBy.push(extensionName)
                })

            }
        }
        Hook.call('Types', {types})
    }
    return types
}

export const getType = (typeName) => {
    const types = getTypes()
    return types[typeName]
}

export const getSubscribeQuery = (typeName) =>{
    const type = getType(typeName)
    if (!type) {
        return
    }

    let subscriptionQuery = `_meta action filter removedIds data${queryStatemantForType({type:typeName})}`

    //console.log(subscriptionQuery, typeName)
   /* type.fields.map(({name, reference, localized}) => {

        if (reference) {
            // todo: query for subtypes
            //subscriptionQuery += ' ' + name + '{_id name}'
        } else {
            if (localized) {
                subscriptionQuery += ' ' + name + '{'+TYPENAME+' ' + _app_.lang + '}'
            } else {
                subscriptionQuery += ' ' + name
            }
        }
    })
    subscriptionQuery += '}'*/
    //console.log(subscriptionQuery)
    return subscriptionQuery
}

export const getTypeQueries = (typeName, queryFields, opts) => {

    const cacheKey = typeName + (queryFields ? queryFields.join('') : '') + (opts ? JSON.stringify(opts) : '')

    if (typeQueries[cacheKey]) return typeQueries[cacheKey]

    const types = getTypes()

    if (!typeName || !types[typeName]) return null


    const {name, fields, noUserRelation, createdByQuery, selectParams, collectionClonable,addMetaDataInQuery} = types[typeName]

    const nameStartLower = name.charAt(0).toLowerCase() + name.slice(1)
    const result = {name: nameStartLower}

    let query = ''
    if (!queryFields || queryFields.indexOf('_id') >= 0) {
        query += '_id '
    }
    if (!queryFields || queryFields.indexOf('status') >= 0) {
        query += 'status '
    }

    let queryMutation = '_id status'
    if (!noUserRelation) {
        const uquery = 'createdBy{'+(createdByQuery?createdByQuery:TYPENAME+' _id username')+'} '
        if (!queryFields || queryFields.indexOf('createdBy') >= 0) {
            query += uquery
        }
        queryMutation += ' ' + uquery
    }

    let insertParams = '', cloneParams = '', insertUpdateQuery = '', updateParams = '', cloneQuery = ''
    if (fields) {
        fields.map(({clone, name, type, required, multi, reference, localized, readOnly, hidden, alwaysLoad, ...rest}) => {

            if ((hidden && !rest.includeInQuery) || rest.uitype === 'htmlParser') return
            const excludeSelect = alwaysLoad === false && opts && opts.loadAll === false

            if (insertParams !== '' && !readOnly) {
                insertParams += ', '
                updateParams += ', '
                insertUpdateQuery += ', '
            }

            const queryType = reference ?
                (multi && !localized? '[' : '') + (localized?'LocalizedRefInput':'ID') + (multi && !localized? ']' : '') :
                (localized ? 'LocalizedStringInput' : (type && type !== 'Object' ? type : 'String'))

            if (!excludeSelect && (!queryFields || queryFields.indexOf(name) >= 0)) {
                if (reference) {
                    if (name !== 'createdBy') {
                        query += ' ' + name + queryStatemantForType({type, fields:rest.fields, localized}, opts)
                    }
                } else {
                    if (localized) {
                        query += name + '{'+TYPENAME+' ' + LANGUAGES.join(' ') + '} '
                    } else {
                        query += name + ' '
                    }
                }
            }

            if (!readOnly) {
                insertParams += '$' + name + ': ' + (multi && !reference ? '[' + queryType + ']' : queryType) + (required ? '!' : '')
                updateParams += '$' + name + ': ' + (multi && !reference ? '[' + queryType + ']' : queryType)
                insertUpdateQuery += name + ': ' + '$' + name
                if (clone!==undefined) {
                    cloneParams += ', $' + name + ': ' + (multi && !reference ? '[' + queryType + ']' : queryType) + (required ? '!' : '')
                    cloneQuery += ',' + name + ': ' + '$' + name
                }
            }

        })
    }
    let selectParamsString = ''
    if (selectParams) {
        selectParams.forEach(item => {
            selectParamsString += `,${item.name}:${item.defaultValue}`
        })
    }
    result.query = `query ${nameStartLower}s($sort:String,$limit:Int,$page:Int,$filter:String${collectionClonable ? ',$_version:String' : ''}${addMetaDataInQuery ? ',$meta:String' : ''}){${nameStartLower}s(sort:$sort,limit:$limit,page:$page,filter:$filter${selectParamsString}${collectionClonable ? ',_version:$_version' : ''}${addMetaDataInQuery ? ',meta:$meta' : ''}){limit offset total meta results{${query}}}}`


    result.create = `mutation create${name}(${collectionClonable ? '$_version:String,' : ''}${insertParams}){create${name}(${collectionClonable ? '_version:$_version,' : ''}${insertUpdateQuery}){${queryMutation}}}`
    result.update = `mutation update${name}($_id:ID!${noUserRelation ? '' : ',$createdBy:ID'}${collectionClonable ? ',$_version:String' : ''}${addMetaDataInQuery ? ',$_meta:String' : ''},${updateParams}){update${name}(_id:$_id${noUserRelation ? '' : ',createdBy:$createdBy'}${addMetaDataInQuery ? ',_meta:$_meta' : ''}${collectionClonable ? ',_version:$_version' : ''},${insertUpdateQuery}){${queryMutation}}}`
    result.delete = `mutation delete${name}($_id:ID!${collectionClonable ? ',$_version:String' : ''}){delete${name}(_id: $_id${collectionClonable ? ',_version:$_version' : ''}){${queryMutation}}}`
    result.deleteMany = `mutation delete${name}s($_id: [ID]${collectionClonable ? ',$_version:String' : ''}){delete${name}s(_id: $_id${collectionClonable ? ',_version:$_version' : ''}){${queryMutation}}}`
    result.clone = `mutation clone${name}($_id: ID!${collectionClonable ? ',$_version:String' : ''}${cloneParams}){clone${name}(_id: $_id${collectionClonable ? ',_version:$_version' : ''}${cloneQuery}){${query}}}`
    typeQueries[cacheKey] = result
    return result
}

export const queryStatemantForType = (field, opts = {}, level = 0) => {
    let subQuery = ''
    const typeDate = getType(field.type)
    if (typeDate && typeDate.fields) {
        for (let i = 0; i < typeDate.fields.length; i++) {
            const subField = typeDate.fields[i]

            if( subField.reference /* && (!field.referenceLevel || field.referenceLevel<=level)*/){
                //subQuery += ' ' + subField.name + '{_id}'
                continue
            }

            if(field.fields){
                if(!field.fields.includes(subField.name)){
                    continue
                }
            }else if(subField.alwaysLoad === false && opts.loadAll === false){
                continue
            }

            subQuery += ' ' + subField.name

            if (subField.reference) {
                // not supported yet
                subQuery += queryStatemantForType(subField,opts, level+1)
            }else if (subField.localized) {
                subQuery += '{'+TYPENAME+' '
                LANGUAGES.forEach(lang => {
                    subQuery += ' ' + lang
                })
                subQuery += '}'
            }
        }
    } else if(field.fields) {
        subQuery += ' ' + field.fields.join(' ')
    }else{
        // assuming there is a name field
        subQuery += ' name'
    }
    if(subQuery){
        subQuery = `{_id ${TYPENAME}${subQuery}}`
        if(field.localized){
            let langQuery = '{'
            LANGUAGES.forEach(lang => {
                langQuery += lang + subQuery
            })
            langQuery += '} '
            return langQuery
        }else{
            return subQuery
        }
    }
    return subQuery
}


/*
 * Bulk edit of a single sub field inside an Object field (e.g. info.format.tags.genre).
 * Enabled in build.json with
 *   "bulkEditable": {"subPath": true}
 * optional: "defaultPath": "format.tags.genre"
 */
export const getBulkEditSubPathConfig = (field) => {
    if (!field || !field.bulkEditable || field.type !== 'Object') {
        return null
    }
    const cfg = field.bulkEditable
    if (cfg === 'subPath') {
        return {subPath: true}
    }
    if (cfg.constructor === Object && cfg.subPath) {
        return cfg
    }
    return null
}

const FORBIDDEN_PATH_PARTS = ['__proto__', 'constructor', 'prototype']

/* returns the path as array of keys or throws an error if the path is not valid */
export const parseBulkEditSubPath = (path) => {
    if (!path || path.constructor !== String || !path.trim()) {
        throw new Error('Sub path is missing')
    }
    const parts = path.trim().split('.').map(p => p.trim())
    for (const part of parts) {
        if (!part) {
            throw new Error(`Invalid sub path "${path}"`)
        }
        if (part.startsWith('$') || FORBIDDEN_PATH_PARTS.includes(part)) {
            throw new Error(`Invalid key "${part}" in sub path "${path}"`)
        }
    }
    return parts
}

const isContainer = (value) => value && typeof value === 'object' && (value.constructor === Object || Array.isArray(value))
const copyContainer = (value) => Array.isArray(value) ? value.slice(0) : Object.assign({}, value)

/*
 * Sets (or removes) the value at parts inside obj without mutating obj.
 * Only the objects along the path are copied, all other values (incl. ObjectIds, Dates) stay untouched.
 * Missing objects along the path are created.
 */
export const setValueAtSubPath = (obj, parts, value, remove = false) => {
    const root = isContainer(obj) ? copyContainer(obj) : {}
    let current = root
    for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i]
        const next = current[key]
        if (isContainer(next)) {
            current[key] = copyContainer(next)
        } else if (remove) {
            // nothing to remove
            return root
        } else {
            current[key] = {}
        }
        current = current[key]
    }
    const lastKey = parts[parts.length - 1]
    if (remove) {
        if (Array.isArray(current)) {
            current.splice(Number(lastKey), 1)
        } else {
            delete current[lastKey]
        }
    } else {
        current[lastKey] = value
    }
    return root
}
