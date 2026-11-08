import React from 'react'
import {client} from '../../middleware/graphql'
import {QUERY_KEY_VALUES, QUERY_KEY_VALUES_GLOBAL, setKeyValue} from '../../util/keyvalue'
import {_t} from 'util/i18n.mjs'

/*
The settings of a UserSetting are stored in KeyValueGlobal entries with the id of the setting as suffix
(e.g. BaseLayoutSettings-<id>). In the edit dialog of a UserSetting they are shown as tabs and saved back
to KeyValueGlobal. The data model and the loading at runtime (BaseLayout, dynamicSubFields) stay the same,
the values are only loaded when the dialog is opened (one query for all keys).
 */
export const USER_SETTING_KEY_VALUES = [
    {prefix: 'BaseLayoutSettings', field: '_kvBaseLayoutSettings', tab: 'UserSetting.tab.baseLayout', isArray: false},
    {prefix: 'DynamicUserFields', field: '_kvDynamicUserFields', tab: 'UserSetting.tab.userFields', isArray: true},
    {prefix: 'DynamicUserGroupFields', field: '_kvDynamicUserGroupFields', tab: 'UserSetting.tab.userGroupFields', isArray: true}
]

const keyFor = (def, id) => `${def.prefix}-${id}`

const isEmpty = value => value === undefined || value === null || (value.constructor === String && value.trim() === '')

const toText = value => {
    if (isEmpty(value)) {
        return ''
    }
    if (value.constructor !== String) {
        return JSON.stringify(value, null, 2)
    }
    try {
        return JSON.stringify(JSON.parse(value), null, 2)
    } catch (e) {
        return value
    }
}

// compact form to compare values independent of the formatting
const normalize = value => {
    if (isEmpty(value)) {
        return ''
    }
    if (value.constructor !== String) {
        return JSON.stringify(value)
    }
    try {
        return JSON.stringify(JSON.parse(value))
    } catch (e) {
        return value
    }
}

const validate = fields => {
    const fieldErrors = {}
    USER_SETTING_KEY_VALUES.forEach(def => {
        const value = fields[def.field]
        if (!isEmpty(value) && value.constructor === String) {
            try {
                const parsed = JSON.parse(value)
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) !== def.isArray) {
                    fieldErrors[def.field] = _t(def.isArray ? 'UserSetting.mustBeArray' : 'UserSetting.mustBeObject')
                }
            } catch (e) {
                fieldErrors[def.field] = _t('UserSetting.invalidJson', {message: e.message})
            }
        }
    })
    return {isValid: Object.keys(fieldErrors).length === 0, fieldErrors}
}

// the loaded values are kept on the TypeEdit instance, they are reloaded every time the dialog is opened
const getStore = (typeEdit, id) => {
    let store = typeEdit._userSettingKv
    if (store && store.id === id && store.dataToEditOri === typeEdit.state.dataToEditOri) {
        return store
    }
    store = typeEdit._userSettingKv = {id, dataToEditOri: typeEdit.state.dataToEditOri, values: null, error: null}

    client.query({
        fetchPolicy: 'network-only',
        query: QUERY_KEY_VALUES_GLOBAL,
        variables: {keys: USER_SETTING_KEY_VALUES.map(def => keyFor(def, id))}
    }).then(response => {
        if (response?.errors?.length) {
            throw new Error(response.errors[0].message)
        }
        const results = response?.data?.keyValueGlobals?.results || []
        const values = {}
        USER_SETTING_KEY_VALUES.forEach(def => {
            const kv = results.find(r => r.key === keyFor(def, id))
            values[def.field] = toText(kv?.value)
        })
        store.values = values
    }).catch(e => {
        store.error = e.message
    }).finally(() => {
        if (typeEdit._userSettingKv === store) {
            typeEdit.forceUpdate()
        }
    })
    return store
}

/* called from the TypeCreateEdit hook */
export const userSettingCreateEdit = ({props, dataToEdit, parentRef}) => {
    if (!dataToEdit?._id || !parentRef) {
        props.children = [props.children,
            <p key="userSettingHint">{_t('UserSetting.saveFirst')}</p>]
        return
    }

    if (!React.isValidElement(props.children) || !props.children.props.fields) {
        // children were changed by another hook
        return
    }

    const store = getStore(parentRef, dataToEdit._id)

    if (store.error) {
        props.children = [<p key="userSettingError" style={{color: 'red'}}>{store.error}</p>, props.children]
        return
    }

    if (!store.values) {
        // keep the form (the dialog needs it for save / cancel), the tabs are added once the values are loaded
        props.children = [props.children, <p key="userSettingLoading">{_t('UserSetting.loading')}</p>]
        return
    }

    const fields = {...props.children.props.fields}
    USER_SETTING_KEY_VALUES.forEach(def => {
        fields[def.field] = {
            name: def.field,
            label: keyFor(def, dataToEdit._id),
            uitype: 'json',
            tab: _t(def.tab),
            fullWidth: true
        }
    })

    props.children = React.cloneElement(props.children, {
        fields,
        values: {...dataToEdit, ...store.values},
        onValidate: validate
    })
}

/* called from the TypeCreateEditBeforeSave hook */
export const userSettingBeforeSave = ({dataToEdit, editedData, optimisticData, typeEdit, action}) => {
    const store = typeEdit?._userSettingKv
    const changes = []

    USER_SETTING_KEY_VALUES.forEach(def => {
        if (def.field in editedData) {
            const value = editedData[def.field]
            // the fields are not part of the UserSetting type
            delete editedData[def.field]
            delete optimisticData[def.field]

            if (store?.values && dataToEdit?._id && store.id === dataToEdit._id &&
                normalize(value) !== normalize(store.values[def.field])) {
                changes.push({def, value})
            }
        }
    })

    if (changes.length === 0) {
        return
    }

    // BaseLayout loads the settings with the keyValues query
    client.clearCacheStartsWith(QUERY_KEY_VALUES)

    Promise.all(changes.map(({def, value}) => setKeyValue({
        key: keyFor(def, dataToEdit._id),
        value: isEmpty(value) ? (def.isArray ? '[]' : '{}') : value,
        global: true,
        clearCache: true
    }).then(response => {
        if (response?.errors?.length) {
            throw new Error(response.errors[0].message)
        }
    }))).then(() => {
        changes.forEach(({def, value}) => {
            store.values[def.field] = toText(value)
        })
        store.error = null
    }).catch(e => {
        console.error(e)
        store.error = _t('UserSetting.saveError', {message: e.message})
    }).finally(() => {
        // re-render the dialog (form is no longer dirty / error is shown) if it is still open
        if (action?.key === 'save' || store.error) {
            if (typeEdit._userSettingKv === store && typeEdit.state.open) {
                typeEdit.forceUpdate()
            }
        }
    })
}
