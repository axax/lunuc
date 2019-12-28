import extensions from 'gen/extensions'
import Hook from 'util/hook'
import config from 'gen/config'
import {getAllCapabilites} from 'util/capabilities'
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

export const getTypeQueries = (typeName) => {

    if (typeQueries[typeName]) return typeQueries[typeName]

    const types = getTypes()

    if (!typeName || !types[typeName]) return null


    const {name, fields, noUserRelation, selectParams, collectionClonable} = types[typeName]
    const nameStartLower = name.charAt(0).toLowerCase() + name.slice(1)
    const result = {name: nameStartLower}

    let query = '_id status'
    if (!noUserRelation) {
        query += ' createdBy{_id username}'
    }
    let queryMutation = '_id status'

    let insertParams = '', cloneParams = '', insertUpdateQuery = '', updateParams = '', cloneQuery = ''

    if (fields) {
        fields.map(({clone, name, type, required, multi, reference, localized, readOnly, hidden, ...rest}) => {

            if (hidden) return

            if (insertParams !== '' && !readOnly) {
                insertParams += ', '
                updateParams += ', '
                insertUpdateQuery += ', '
            }

            let t = localized ? 'LocalizedStringInput' : (type && type !== 'Object' ? type : 'String')


            if (reference) {
                t = (multi ? '[' : '') + 'ID' + (multi ? ']' : '')

                if (name !== 'createdBy') {

                    query += ' ' + name + '{_id'
                    if (rest.fields) {
                        query += ' ' + rest.fields.join(' ')
                    } else {
                        query += queryStatemantForType(type)
                    }
                    query += '}'
                }
            } else {
                if (localized) {
                    query += ' ' + name + '{' + LANGUAGES.join(' ') + '}'
                } else {
                    query += ' ' + name
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
    result.query = `query ${nameStartLower}s($sort: String,$limit: Int,$page: Int,$filter: String${collectionClonable ? ',$_version: String' : ''}){
                ${nameStartLower}s(sort:$sort, limit: $limit, page:$page, filter:$filter${selectParamsString}${collectionClonable ? ',_version:$_version' : ''}){limit offset total results{${query}}}}`


    result.create = `mutation create${name}(${collectionClonable ? '$_version:String,' : ''}${insertParams}){create${name}(${collectionClonable ? ',_version:$_version' : ''},${insertUpdateQuery}){${queryMutation}}}`
    result.update = `mutation update${name}($_id: ID!${collectionClonable ? ',$_version:String' : ''},${updateParams}){update${name}(_id:$_id${collectionClonable ? ',_version:$_version' : ''},${insertUpdateQuery}){${queryMutation}}}`
    result.delete = `mutation delete${name}($_id: ID!${collectionClonable ? ',$_version:String' : ''}){delete${name}(_id: $_id${collectionClonable ? ',_version:$_version' : ''}){${queryMutation}}}`
    result.deleteMany = `mutation delete${name}s($_id: [ID]${collectionClonable ? ',$_version:String' : ''}){delete${name}s(_id: $_id${collectionClonable ? ',_version:$_version' : ''}){${queryMutation}}}`
    result.clone = `mutation clone${name}($_id: ID!${collectionClonable ? ',$_version:String' : ''}${cloneParams}){clone${name}(_id: $_id${collectionClonable ? ',_version:$_version' : ''}${cloneQuery}){${query}}}`
    typeQueries[typeName] = result
    return result
}

export const queryStatemantForType = (type) => {
    let query = ''
    const typeDate = getType(type)
    if (typeDate && typeDate.fields) {

        for (let i = 0; i < typeDate.fields.length; i++) {
            const field = typeDate.fields[i]
            if (field.reference) {
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
