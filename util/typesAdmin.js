import Hook from 'util/hook'
import config from 'gen/config-client'
import {getAllCapabilites} from 'util/capabilities'
import {getType, getTypes} from './types'
import Util from '../client/util'
import {_t} from 'util/i18n'
import extensionsPrivate from 'gen/extensions-private'
import extensions from 'gen/extensions'

console.log('merge extension defintion')
Object.keys(extensionsPrivate).forEach(key => {
    extensions[key] = extensionsPrivate[key]
})

const {LANGUAGES} = config, typeFormFields = {}

export const typeDataToLabel = (item, pickerField) => {
    let label = []

    if (!item) {
        return 'null'
    }

    //TODO move to extension
    if (item.__typename === 'GenericData') {
        const definition = item.definition
        try {
            if (item.data.constructor === Object) {
                item = item.data
            } else {
                item = JSON.parse(item.data)
            }
        } catch (e) {
            console.log(e)
        }

        if (!pickerField) {
            if (definition) {
                try {
                    const structur = JSON.parse(item.definition.structure)
                    pickerField = structur.pickerField
                } catch (e) {
                    console.log(e)
                }
            }
        }
    }

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

            if (item[key] && item[key][_app_.lang]) {
                label.push(item[key][_app_.lang])
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
    if (!types[type].noUserRelation && Util.hasCapability({userData: _app_.user}, 'manage_other_users')) {
        // add field so the createdBy User can be changed
        typeFormFields[type].createdBy = {
            label: _t('Types.createdBy'),
            uitype: 'type_picker',
            pickerField: 'username',
            type: 'User',
            required: true,
            reference: true,
            name: 'createdBy'
        }
    }
    types[type].fields.map(field => {
        if (field.name !== 'modifiedAt') {
            let uitype = field.uitype, placeholder = '', label = ''
            // if uitype is not defined and if it is a reference to another type use type_picker
            if (!uitype && field.reference) {
                uitype = 'type_picker'
                placeholder = _t('Types.selectType', field)
                label = _t(`${type}.field.${field.name}`, null, `${field.name} -> ${field.type}`)
            } else {
                label = _t(`${type}.field.${field.name}`, null, field.name)
                placeholder = _t('Types.enterField', field)
            }
            typeFormFields[type][field.name] = {
                placeholder,
                label,
                uitype,
                multi: !!field.multi,
                fullWidth: !!field.fullWidth,
                readOnly: !!field.readOnly,
                alwaysUpdate: !!field.alwaysUpdate,
                type: field.type,
                tab: field.tab,
                required: !!field.required,
                localized: !!field.localized,
                pickerField: field.pickerField,
                fields: field.fields,
                subFields: field.subFields,
                reference: !!field.reference,
                enum: field.enum,
                name: field.name
            }
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

    Object.keys(data).map(key => {
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
    } else if (field.replaceBreaks) {
        value = value.replace(/(?:\r\n|\r|\n)/g, '<br>')
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
                name: 'value',
                uitype: 'editor'
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
        entryClonable: true,
        description: 'If public is true on a KeyValue the value of it can be seen from everyone.',
        usedBy: ['core'],
        fields: [
            {
                clone: "${key}_copy",
                name: 'key',
                required: true
            },
            {
                name: 'value',
                uitype: 'editor',
                alwaysLoad: false
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
                fullWidth: true,
                required: true,
                tab: 'General'
            },
            {
                name: 'password',
                fullWidth: true,
                required: true,
                uitype: 'password',
                tab: 'General'
            },
            {
                name: 'email',
                fullWidth: true,
                required: true,
                tab: 'General'
            },
            {
                name: 'language'
            },
            {
                name: 'picture',
                type: 'Media',
                reference: true,
                fields: ['name'],
                tab: 'General'
            },
            {
                name: 'emailConfirmed',
                type: 'Boolean'
            },
            {
                name: 'requestNewPassword',
                type: 'Boolean'
            },
            {
                name: 'meta',
                type: 'Object',
                uitype: 'json',
                tab: 'Meta'
            },
            {
                name: 'lastLogin',
                label: 'Last login',
                uitype: 'datetime',
                readOnly: true
            },
            {
                name: 'role',
                type: 'UserRole',
                reference: true,
                fields: ['name'],
                tab: 'Access Control'
            },
            {
                name: 'junior',
                type: 'User',
                label: 'Junior User',
                reference: true,
                multi: true,
                fields: ['username'],
                tab: 'Access Control'
            }
        ]
    }

})
