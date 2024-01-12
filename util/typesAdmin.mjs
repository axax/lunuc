import Hook from './hook.cjs'
import {
    CAPABILITY_MANAGE_OTHER_USERS,
    CAPABILITY_MANAGE_SAME_GROUP,
    CAPABILITY_MANAGE_USER_GROUP,
    CAPABILITY_MANAGE_USER_ROLE,
    getAllCapabilites
} from './capabilities.mjs'
import {getTypes} from './types.mjs'
import {_t} from './i18n.mjs'
import extensionsPrivate from '../gensrc/extensions-private.mjs'
import extensions from '../gensrc/extensions.mjs'
import {propertyByPath} from '../client/util/json.mjs'
import Util from '../client/util/index.mjs'
import {client} from '../client/middleware/graphql.js'

console.log(`replace / merge extension definition with extended version`)
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
    } else if(context.item.name){
        pickers.push('name')
    }else {

        for (const key of Object.keys(context.item)) {
            if (['_id', 'createdBy', '__typename', 'status'].indexOf(key) < 0) {
                pickers.push(key)
                break
            }
        }
    }

    pickers.forEach(key => {
        const value = propertyByPath(key,context.item)
        if (value) {
            if (value[_app_.lang]) {
                label.push(value[_app_.lang])
            } else {
                label.push(value)
            }
        }
    })
    return label.join(' ')
}

const getCreatedByField = (options= {})=>{
    return {
        label: _t('Types.createdBy'),
        uitype: 'type_picker',
        pickerField: 'username',
        type: 'User',
        required: true,
        reference: true,
        name: 'createdBy',
        ...options
    }
}

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
        typeFormFields[type].createdBy = getCreatedByField()
    }
    types[type].fields.map(field => {
        if (field.name !== 'modifiedAt') {
            typeFormFields[type][field.name] = enhanceField(field, type)
        }
    })
    return typeFormFields[type]
}

const enhanceField = (field, type) => {
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
    const newField = {label, placeholder, uitype}
    if(field.tab){
        newField.tab = _t(`${type}.tab.${field.tab}`,null, field.tab)
    }

    return Object.assign({}, field, newField)
}

export const hasFieldsForBulkEdit = (type) => {
    const types = getTypes()
    if (!types[type]) {
        return false
    }

    if(!types[type].noUserRelation && Util.hasCapability({userData: _app_.user}, CAPABILITY_MANAGE_OTHER_USERS)){
        return true
    }

    for(const field of types[type].fields){
        if(field.bulkEditable){
            return true
        }
    }
    return false
}

export const getFieldsForBulkEdit = (type) => {
    const types = getTypes()
    const fields = {}
    if (types[type]) {
        for (const field of types[type].fields) {
            if (field.bulkEditable) {
                fields[field.name] = enhanceField(field, type)
                delete fields[field.name].tab
            }
        }
    }
    if(Util.hasCapability({userData: _app_.user}, CAPABILITY_MANAGE_OTHER_USERS)) {
        fields.createdBy = getCreatedByField({required: true})
    }
    return fields
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
        const fieldDefinition = formFields[key]
        if (item !== undefined && fieldDefinition) {

            if (fieldDefinition.localized) {
                if(fieldDefinition.reference && item){
                    newData[key] = Object.keys(item).reduce((acc,key)=>{
                        acc[key]=item[key].map(it=>it._id)
                        return acc
                    },{})
                }else {
                    newData[key] = item
                    if (item) {
                        delete newData[key].__typename //= 'LocalizedStringInput'
                    }
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
    if (field.type === 'Float'){
        if( field.uitype === 'datetime' || field.uitype === 'date') {
            // save date as unix timestamp number
            if(value) {
                value = Date.parse(value)
            }else{
                value = 0
            }
        } else {
            value = parseFloat(value)
        }
        if (isNaN(value)) {
            value = null
        }
    } else if (field.type === 'Int' || field.type === 'Integer') {
        value = parseInt(value)
        if (isNaN(value)) {
            value = null
        }
    } else if (field.type === 'Double') {
        value = parseFloat(value)
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
        entryClonable: true,
        fields: [
            {
                clone: "${key}_copy",
                name: 'key',
                required: true
            },
            {
                type:'String',
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
        access:{read:CAPABILITY_MANAGE_USER_ROLE,create: CAPABILITY_MANAGE_USER_ROLE, update:CAPABILITY_MANAGE_USER_ROLE},
        name: 'UserRole',
        noUserRelation: true,
        usedBy: ['core'],
        fields: [
            {
                name: 'name',
                required: true,
                unique:true,

            },
            {
                name: 'prettyName',
                required: false,
                localized:true
            },
            {
                name: 'capabilities',
                required: true,
                multi: true,
                enum: getAllCapabilites()
            },
            {
                name: 'ownerGroup',
                hideColumnInTypes: false,
                access: {
                    ui: {
                        role: 'manage_user_group'
                    }
                },
                type: 'UserGroup',
                multi: true,
                fields: [
                    'name'
                ],
                index: 1,
                reference: true
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

    types.UserSetting = {
        name: 'UserSetting',
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
                uitype: 'password',
                tab: 'Allgemein',
                hideColumnInTypes: true,
                alwaysLoad:false,
                vagueSearchable:false,
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
                name: 'domain',
                fullWidth: true,
                required: false,
                alwaysUpdate: true,
                hideColumnInTypes: true,
                tab: 'Allgemein',
                access: {
                    ui: {
                        role: CAPABILITY_MANAGE_USER_GROUP
                    }
                }
            },
            {
                fullWidth: true,
                name: 'picture',
                type: 'Media',
                reference: true,
                fields: ['name','mimeType'],
                filter: 'mimeType=image',
                vagueSearchable:false
            },
            {
                name: 'emailConfirmed',
                type: 'Boolean',
                hideColumnInTypes: true,
                vagueSearchable:false
            },
            {
                name: 'blocked',
                type: 'Boolean',
                vagueSearchable:false
            },
            {
                name: 'language',
                vagueSearchable:false
            },
            {
                name: 'meta',
                type: 'Object',
                uitype: 'json',
                tab: 'Meta',
                alwaysLoad: false,
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
                name: 'lastActive',
                uitype: 'datetime',
                readOnly: true,
                vagueSearchable:false,
                hideColumnInTypes: true
            },
            {
                name: 'role',
                type: 'UserRole',
                reference: true,
                pickerField:['prettyName.de'],
                tab: _t('Types.accessControl'),
                access: {
                    ui: {
                        role: CAPABILITY_MANAGE_SAME_GROUP
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
            },
            {
                name: 'setting',
                type: 'UserSetting',
                reference: true,
                fields: ['name'],
                tab: _t('Types.accessControl'),
                multi:true,
                fullWidth:true,
                hideColumnInTypes: true,
                vagueSearchable:false
            }
        ]
    }
})

Hook.on('TypeCreateEdit', function ({type, props, dataToEdit}) {
    if (type === 'User' && dataToEdit && dataToEdit._id) {
        props.actions.unshift({key: 'setNewPassword', label: _t('user.send.new.password')})
    }
})
Hook.on('TypeCreateEditAction', function ({type, action, dataToEdit, meta}) {
    if (type === 'User' && action.key === 'setNewPassword') {
        meta.TypeContainer.setState({simpleDialog:{title: _t('user.send.new.password'),
                actions: [{key: 'cancel', label: _t('core.cancel')},{key: 'yes', label: _t('core.yes')}],
                onClose: (action) => {
                    if(action.key==='yes'){
                        client.query({
                            fetchPolicy: 'network-only',
                            forceFetch: true,
                            variables: {ids: [dataToEdit._id], fromName:_app_.user.domain || '',url:`${location.origin}/${_app_.user.domain || ''}`},
                            query: 'query setInitalPassword($ids:[ID],$url:String,$fromName:String){setInitalPassword(ids:$ids,url:$url,fromName:$fromName){status}}'
                        }).then(response => {
                            if (response.data && response.data.setInitalPassword) {
                                if (meta && meta.TypeContainer) {
                                    meta.TypeContainer.setState({simpleDialog: {children: response.data.setInitalPassword.status}})
                                }
                            }
                        }).catch((error)=>{
                        })
                    }
                    meta.TypeContainer.setState({simpleDialog: false})
                },
                children: _t('user.send.new.password.question')}})
    }
})

Hook.on('ApiClientQueryResponse', ({response}) => {

    const data = response && response.data && response.data.users

    if (data && data.results) {
        data.results.forEach(item=>{
            if(item.meta) {
                item.meta = JSON.parse(item.meta)
            }
        })
    }
})