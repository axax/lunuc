import Hook from 'util/hook'
import config from 'gen/config'
import {getAllCapabilites} from 'util/capabilities'
import {getType,getTypes} from './types'

const {LANGUAGES} = config, typeFormFields = {}

export const typeDataToLabel = (item, pickerField) => {
    let label = []

    let pickers = []

    if (pickerField) {
        pickers.push(pickerField)
    } else {
        for (const key of Object.keys(item)) {
            if (['_id', 'createdBy', '__typename', 'status'].indexOf(key) < 0) {
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

// returns the field informations of a type that are need to create a form
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
            alwaysUpdate: !!field.alwaysUpdate,
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

/* if the flag alwaysUpdate is set to true on a field that means the server expect the data on an update even if the data has not changed */
export const addAlwaysUpdateData = (data, changedData, type) => {
    const typeDef = getFormFields(type)
    Object.keys(typeDef).forEach((key) => {
        if (typeDef[key].alwaysUpdate) {
            changedData[key] = data[key]
        }
    })
}


// if the field is a reference remove all attribute but the _id
export const referencesToIds = (data, type) => {
    const formFields = getFormFields(type)
    const newData = {}

    Object.keys(data).map(key=> {
        const item = data[key]

        if (item !== undefined) {
            const fieldDefinition = formFields[key]

            if (fieldDefinition.localized) {
                newData[key] = item
                if (item) {
                    delete newData[key].__typename //= 'LocalizedStringInput'
                }
            } else if (item && !fieldDefinition.enum && item.constructor === Array) {

                if (item.length > 0) {
                    if (fieldDefinition.multi) {
                        newData[key] = item.map(i => i._id)
                    } else {
                        newData[key] = item[0]._id
                    }
                } else {
                    newData[key] = null
                }
            } else if (item && item.constructor === Object && fieldDefinition.reference) {
                newData[key] = item._id
            } else {
                newData[key] = item
            }
        }
    })
    return newData
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