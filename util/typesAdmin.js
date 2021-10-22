import Hook from 'util/hook'
import {getAllCapabilites} from 'util/capabilities'
import {getType, getTypes} from './types'
import {_t} from 'util/i18n'
import extensionsPrivate from 'gen/extensions-private'
import extensions from 'gen/extensions'
import {
    CAPABILITY_MANAGE_USER_GROUP
} from 'util/capabilities'

console.log('merge extension defintion')
Object.keys(extensionsPrivate).forEach(key => {
    extensions[key] = extensionsPrivate[key]
})

const typeFormFields = {}

export const typeDataToLabel = (item, pickerField) => {
    let label = []

    if (!item) {
        return 'null'
    }
    const context = {item, pickerField}



    Hook.call('typeDataToLabel', context)


    let pickers = []
    if (context.pickerField) {
        if (context.pickerField.constructor === Array) {
            pickers.push(...context.pickerField)
        } else {
            pickers.push(context.pickerField)
        }
    } else {
        for (const key of Object.keys(context.item)) {
            if (['_id', 'createdBy', '__typename', 'status'].indexOf(key) < 0) {
                pickers.push(key)
                break
            }
        }
    }

    pickers.forEach(key => {
        if (context.item[key]) {

            if (context.item[key] && context.item[key][_app_.lang]) {
                label.push(context.item[key][_app_.lang])
            } else {
                label.push(context.item[key])
            }
        }
    })
    return label.join(' ')
}

//

/**
 * returns a map with informations about the form field of a type
 *
 * @param {String} type
 *
 * @returns {Object} an object
 */
export const getFormFieldsByType = (type) => {
    if (typeFormFields[type]) return typeFormFields[type]

    const types = getTypes()
    if (!types[type]) {
        return null
        //throw new Error('Cannot find type "'+type+'" in getFormFieldsByType')
    }
    typeFormFields[type] = {}
    if (!types[type].noUserRelation /*&& Util.hasCapability({userData: _app_.user}, 'manage_other_users')*/) {
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
                label = _t(`${type}.field.${field.name}`, null, field.label || field.name)
                placeholder = _t('Types.enterField', field)
            }
            typeFormFields[type][field.name] = Object.assign({}, field, {label, placeholder, uitype})

            /*   placeholder,
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
               name: field.name,
               searchable: !!field.searchable,
               vagueSearchable:
           }*/
        }
    })
    return typeFormFields[type]
}

export const getFormFieldsByFieldList = (fieldList) => {

    const fields = {}
    for (let i = 0; i < fieldList.length; ++i) {
        fields[fieldList[i].name] = fieldList[i]
    }
    return fields
}

/* if the flag alwaysUpdate is set to true on a field that means the server expect the data on an update even if the data has not changed */
export const addAlwaysUpdateData = (data, changedData, type) => {
    const typeDef = getFormFieldsByType(type)
    Object.keys(typeDef).forEach((key) => {
        if (typeDef[key].alwaysUpdate) {
            if (typeDef[key].reference && data[key] && data[key]._id) {
                changedData[key] = data[key]._id
            } else {
                changedData[key] = data[key]
            }
        }
    })
}


/**
 * Clean up references. If the field is a reference remove all attribute but the _id
 *
 * @param {Object} data object
 * @param {String} type of the data
 *
 * @returns {Object} an new object with only ids for references
 */
export const referencesToIds = (data, type) => {
    const formFields = getFormFieldsByType(type)
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
                name: 'name',
                required: true
            },
            {
                name: 'capabilities',
                required: true,
                multi: true,
                enum: getAllCapabilites()
            }
        ]
    }


    types.UserGroup = {
        name: 'UserGroup',
        noUserRelation: true,
        usedBy: ['core'],
        fields: [
            {
                name: 'name',
                required: true
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
                tab: 'Allgemein'
            },
            {
                name: 'email',
                fullWidth: true,
                required: true,
                tab: 'Allgemein'
            },
            {
                name: 'password',
                fullWidth: false,
                required: true,
                uitype: 'password',
                tab: 'Allgemein',
                hideColumnInTypes: true,
                searchable:false
            },
            {
                name: 'requestNewPassword',
                fullWidth: false,
                type: 'Boolean',
                tab: 'Allgemein',
                hideColumnInTypes: true,
                vagueSearchable:false
            },
            {
                name: 'language',
                vagueSearchable:false
            },
            {
                name: 'picture',
                type: 'Media',
                reference: true,
                fields: ['name'],
                vagueSearchable:false
            },
            {
                name: 'emailConfirmed',
                type: 'Boolean',
                hideColumnInTypes: true,
                vagueSearchable:false
            },
            {
                name: 'meta',
                type: 'Object',
                uitype: 'json',
                tab: 'Meta',
                vagueSearchable: true,
                hideColumnInTypes: true
            },
            {
                name: 'lastLogin',
                uitype: 'datetime',
                readOnly: true,
                vagueSearchable:false
            },
            {
                name: 'role',
                type: 'UserRole',
                reference: true,
                fields: ['name'],
                tab: _t('Types.accessControl'),
                access: {
                    ui: {
                        role: CAPABILITY_MANAGE_USER_GROUP
                    }
                },
                vagueSearchable:false
            },
            {
                name: 'junior',
                type: 'User',
                reference: true,
                multi: true,
                fields: ['username'],
                tab: _t('Types.accessControl'),
                hideColumnInTypes: true,
                access: {
                    ui: {
                        role: CAPABILITY_MANAGE_USER_GROUP
                    }
                },
                vagueSearchable:false
            },
            {
                name: 'group',
                type: 'UserGroup',
                reference: true,
                multi: true,
                fields: ['name'],
                tab: _t('Types.accessControl'),
                hideColumnInTypes: true,
                access: {
                    ui: {
                        role: CAPABILITY_MANAGE_USER_GROUP
                    }
                },
                vagueSearchable:false
            }
        ]
    }

})
