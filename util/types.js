import extensions from 'gen/extensions'
import Hook from 'util/hook'
import config from 'gen/config'
import {getAllCapabilites} from 'util/capabilities'

const {LANGUAGES} = config

const types = {}, typeQueries = {}, typeFormFields = {}

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
    // todo: optimise so that not all types need to be loaded
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


export const typeDataToLabel = (item, pickerField) => {
    let label = []

    let pickers = []

    if (pickerField) {
        pickers.push(pickerField)
    } else {
        for (const key of Object.keys(item)) {
            if (['_id', 'createdBy', '__typename'].indexOf(key) < 0) {
                pickers.push(key)
                break
            }
        }
    }

    pickers.forEach(key => {
        if (item[key]) {
            if (item[key].constructor === Object) {
                if (item[key][_app_.lang]) {
                    label.push(item[key][_app_.lang])
                }
            } else {
                label.push(item[key])
            }
        }
    })
    return label.join(' ')
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

export const getFormFields = (type) => {
    if (typeFormFields[type]) return typeFormFields[type]
    const types = getTypes()
    if (!types[type]) {
        return null
        //throw new Error('Cannot find type "'+type+'" in getFormFields')
    }

    typeFormFields[type] = {}
    types[type].fields.map(field => {
        let uitype = field.uitype, placeholder = ''
        // if uitype is not defined and if it is a reference to another type use type_picker
        if (!uitype && field.reference) {
            uitype = 'type_picker'
            placeholder = `${field.name} -> ${field.type}`
        } else {
            placeholder = `Enter ${field.name}`
        }
        typeFormFields[type][field.name] = {
            placeholder,
            uitype,
            multi: !!field.multi,
            readOnly: !!field.readOnly,
            type: field.type,
            required: !!field.required,
            localized: !!field.localized,
            pickerField: field.pickerField,
            fields: field.fields,
            reference: !!field.reference,
            enum: field.enum,
            name: field.name
        }
    })

    return typeFormFields[type]
}

export const checkFieldType = (value, field) => {

    if (field.type === 'Float') {
        value = parseFloat(value)
        if (isNaN(value)) {
            value = null
        }
    } else if (field.type === 'Int') {
        value = parseInt(value)
        if (isNaN(value)) {
            value = null
        }
    }

    return value
}


/* Register manually created types */

Hook.on('Types', ({types}) => {

    types.KeyValue = {
        name: 'KeyValue',
        usedBy: ['core'],
        fields: [
            {
                name: 'key',
                required: true
            },
            {
                name: 'value'
            },
            {
                name: 'createdBy',
                pickerField: 'username',
                type: 'User',
                reference: true,
                required: true
            }
        ],
        selectParams: [{
            name: 'all',
            type: 'Boolean',
            defaultValue: true
        }]
    }

    types.KeyValueGlobal = {
        name: 'KeyValueGlobal',
        description: 'If public is true on a KeyValue the value of it can be seen from everyone.',
        usedBy: ['core'],
        fields: [
            {
                name: 'key',
                required: true
            },
            {
                name: 'value',
                uitype: 'editor'
            },
            {
                name: 'ispublic',
                type: 'Boolean'
            }
        ]
    }


    types.UserRole = {
        name: 'UserRole',
        noUserRelation: true,
        usedBy: ['core'],
        fields: [
            {
                name: 'name'
            },
            {
                name: 'capabilities',
                multi: true,
                enum: getAllCapabilites()
            }
        ]
    }

    types.User = {
        name: 'User',
        noUserRelation: true,
        usedBy: ['core'],
        fields: [
            {
                name: 'username',
                required: true
            },
            {
                name: 'email',
                required: true
            },
            {
                name: 'emailConfirmed',
                type: 'Boolean'
            },
            {
                name: 'lastLogin',
                label: 'Last login',
                uitype: 'datetime',
                readOnly: true
            },
            {
                name: 'password',
                required: true,
                uitype: 'password'
            },
            {
                name: 'role',
                type: 'UserRole',
                reference: true,
                fields: ['name']
            }
        ]
    }

})
