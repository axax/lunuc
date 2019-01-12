import extensions from 'gen/extensions'
import Hook from 'util/hook'
import config from 'gen/config'
import {CAPABILITIES} from 'util/capabilities'

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

    const result = {}

    const {name, fields, noUserRelation, selectParams, collectionClonable} = types[typeName]
    const nameStartLower = name.charAt(0).toLowerCase() + name.slice(1)

    let query = '_id status'
    if (!noUserRelation) {
        query += ' createdBy{_id username}'
    }
    let queryMutation = '_id status'

    let insertParams = '', insertUpdateQuery = '', updateParams = ''

    if (fields) {
        fields.map(({name, type, required, multi, reference, localized, ...rest}) => {

            if (insertParams !== '') {
                insertParams += ', '
                updateParams += ', '
                insertUpdateQuery += ', '
            }

            let t = type || 'String'


            if (reference) {
                t = (multi ? '[' : '') + 'ID' + (multi ? ']' : '')

                if (name !== 'createdBy') {
                    query += ' ' + name + '{_id'
                    if (rest.fields) {
                        query += ' ' + rest.fields.join(' ')
                    } else {
                        // assuming there is a name field
                        query += ' name'
                    }
                    query += '}'
                }
            } else {
                query += ' ' + name
                if (localized) {
                    if (name !== 'createdBy') {
                        query += ' ' + name + '_localized{' + LANGUAGES.join(' ') + '}'
                    }
                    const x = '$' + name + '_localized: LocalizedStringInput,'
                    insertParams += x
                    updateParams += x
                    insertUpdateQuery += name + '_localized: ' + '$' + name + '_localized,'
                }
            }

            insertParams += '$' + name + ': ' + (multi ? '[' + t + ']' : t) + (required ? '!' : '')
            updateParams += '$' + name + ': ' + (multi && !reference ? '[' + t + ']' : t)
            insertUpdateQuery += name + ': ' + '$' + name
        })
    }
    let selectParamsString = ''
    if (selectParams) {
        selectParams.forEach(item => {
            selectParamsString += `,${item.name}:${item.defaultValue}`
        })
    }
    result.query = `query ${nameStartLower}s($sort: String,$limit: Int,$page: Int,$filter: String${collectionClonable ? ',$version: String' : ''}){
                ${nameStartLower}s(sort:$sort, limit: $limit, page:$page, filter:$filter${selectParamsString}${collectionClonable ? ',version:$version' : ''}){limit offset total results{${query}}}}`


    result.create = `mutation create${name}(${collectionClonable ? ',$_version:String' : ''},${insertParams}){create${name}(${collectionClonable ? ',_version:$_version' : ''},${insertUpdateQuery}){${queryMutation}}}`
    result.update = `mutation update${name}($_id: ID!${collectionClonable ? ',$_version:String' : ''},${updateParams}){update${name}(_id:$_id${collectionClonable ? ',_version:$_version' : ''},${insertUpdateQuery}){${queryMutation}}}`
    result.delete = `mutation delete${name}($_id: ID!${collectionClonable ? ',$_version:String' : ''}){delete${name}(_id: $_id${collectionClonable ? ',_version:$_version' : ''}){${queryMutation}}}`
    result.deleteMany = `mutation delete${name}s($_id: [ID]${collectionClonable ? ',$_version:String' : ''}){delete${name}s(_id: $_id${collectionClonable ? ',_version:$_version' : ''}){${queryMutation}}}`
    result.clone = `mutation clone${name}($_id: ID!${collectionClonable ? ',$_version:String' : ''},${updateParams}){clone${name}(_id: $_id${collectionClonable ? ',_version:$_version' : ''},${insertUpdateQuery}){${query}}}`

    typeQueries[typeName] = result
    return result
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
            type: field.type,
            required: !!field.required,
            localized: !!field.localized,
            pickerField: field.pickerField,
            reference: !!field.reference,
            enum: field.enum
        }
    })

    return typeFormFields[type]
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
                enum: CAPABILITIES
            }
        ]
    }

    types.User = {
        name: 'User',
        noUserRelation: true,
        usedBy: ['core'],
        fields: [
            {
                'name': 'username',
                'required': true
            },
            {
                'name': 'email',
                'required': true
            },
            {
                'name': 'password',
                'required': true
            },
            {
                'name': 'role',
                'type': 'UserRole',
                'reference': true
            }
        ]
    }


    types.Media = {
        'name': 'Media',
        'usedBy': ['core'],
        'fields': [
            {
                'name': 'name'
            },
            {
                'name': 'mimeType'
            }
        ]
    }

    types.CmsPage = {
        name: 'CmsPage',
        collectionClonable: true,
        entryClonable: true,
        usedBy: ['core'],
        fields: [
            {
                name: 'name',
                label: 'Name'
            },
            {
                name: 'slug',
                label: 'Slug',
                required: false,
                clone: '${slug}_copy'
            },
            {
                name: 'public',
                label: 'Public',
                type: 'Boolean'
            },
            {
                name: 'urlSensitiv',
                label: 'Url sensitiv',
                type: 'Boolean'
            }
        ]
    }
})