import extensions from 'gen/extensions'
import Hook from 'util/hook'
import config from 'gen/config-client'

const {LANGUAGES} = config

export const types = {}, typeQueries = {}

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

export const getTypeQueries = (typeName, queryFields, opts) => {

    const cacheKey = typeName + (queryFields ? queryFields.join('') : '') + (opts ? JSON.stringify(opts) : '')

    if (typeQueries[cacheKey]) return typeQueries[cacheKey]

    const types = getTypes()

    if (!typeName || !types[typeName]) return null


    const {name, fields, noUserRelation, selectParams, collectionClonable,addMetaDataInQuery} = types[typeName]

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

        if (!queryFields || queryFields.indexOf('createdBy') >= 0) {
            query += 'createdBy{_id username} '
        }
        queryMutation += ' createdBy{_id username}'
    }

    let insertParams = '', cloneParams = '', insertUpdateQuery = '', updateParams = '', cloneQuery = ''

    if (fields) {
        fields.map(({clone, name, type, required, multi, reference, localized, readOnly, hidden, alwaysLoad, ...rest}) => {

            if (hidden) return
            const excludeSelect = alwaysLoad === false && opts && opts.loadAll === false

            if (insertParams !== '' && !readOnly) {
                insertParams += ', '
                updateParams += ', '
                insertUpdateQuery += ', '
            }

            let t = localized ? 'LocalizedStringInput' : (type && type !== 'Object' ? type : 'String')


            if (!excludeSelect && (!queryFields || queryFields.indexOf(name) >= 0)) {
                if (reference) {
                    t = (multi ? '[' : '') + 'ID' + (multi ? ']' : '')

                    if (name !== 'createdBy') {

                        query += ' ' + name + '{_id'
                        if (rest.fields) {
                            query += ' ' + rest.fields.join(' ')
                        } else {
                            query += queryStatemantForType(type, opts)
                        }
                        query += '} '
                    }
                } else {
                    if (localized) {
                        query += name + '{' + LANGUAGES.join(' ') + '} '
                    } else {
                        query += name + ' '
                    }
                }
            }

            if (!readOnly) {
                insertParams += '$' + name + ': ' + (multi && !reference ? '[' + t + ']' : t) + (required ? '!' : '')
                updateParams += '$' + name + ': ' + (multi && !reference ? '[' + t + ']' : t)
                insertUpdateQuery += name + ': ' + '$' + name
                if (clone) {
                    cloneParams += ', $' + name + ': ' + (multi && !reference ? '[' + t + ']' : t) + (required ? '!' : '')
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
    result.query = `query ${nameStartLower}s($sort: String,$limit: Int,$page: Int,$filter: String${collectionClonable ? ',$_version: String' : ''}${addMetaDataInQuery ? ',$meta: String' : ''}){${nameStartLower}s(sort:$sort, limit: $limit, page:$page, filter:$filter${selectParamsString}${collectionClonable ? ',_version:$_version' : ''}${addMetaDataInQuery ? ',meta:$meta' : ''}){limit offset total meta results{${query}}}}`


    result.create = `mutation create${name}(${collectionClonable ? '$_version:String,' : ''}${insertParams}){create${name}(${collectionClonable ? ',_version:$_version' : ''},${insertUpdateQuery}){${queryMutation}}}`
    result.update = `mutation update${name}($_id:ID!${noUserRelation ? '' : ',$createdBy:ID'}${collectionClonable ? ',$_version:String' : ''}${addMetaDataInQuery ? ',$_meta:String' : ''},${updateParams}){update${name}(_id:$_id${noUserRelation ? '' : ',createdBy:$createdBy'}${addMetaDataInQuery ? ',_meta:$_meta' : ''}${collectionClonable ? ',_version:$_version' : ''},${insertUpdateQuery}){${queryMutation}}}`
    result.delete = `mutation delete${name}($_id:ID!${collectionClonable ? ',$_version:String' : ''}){delete${name}(_id: $_id${collectionClonable ? ',_version:$_version' : ''}){${queryMutation}}}`
    result.deleteMany = `mutation delete${name}s($_id: [ID]${collectionClonable ? ',$_version:String' : ''}){delete${name}s(_id: $_id${collectionClonable ? ',_version:$_version' : ''}){${queryMutation}}}`
    result.clone = `mutation clone${name}($_id: ID!${collectionClonable ? ',$_version:String' : ''}${cloneParams}){clone${name}(_id: $_id${collectionClonable ? ',_version:$_version' : ''}${cloneQuery}){${query}}}`
    typeQueries[cacheKey] = result
    return result
}

export const queryStatemantForType = (type, opts) => {
    let query = ''
    const typeDate = getType(type)
    if (typeDate && typeDate.fields) {

        for (let i = 0; i < typeDate.fields.length; i++) {
            const field = typeDate.fields[i]

            const excludeSelect = field.alwaysLoad === false && opts && opts.loadAll === false

            if (field.reference || excludeSelect) {
                continue
            }

            query += ' ' + field.name
            if (field.localized) {
                query += '{'
                LANGUAGES.forEach(lang => {
                    query += ' ' + lang
                })
                query += '}'
            }
        }
    } else {
        // assuming there is a name field
        query += ' name'
    }
    return query
}
