import React, {useState} from 'react'
import Hook from 'util/hook.cjs'
import {client} from "../../client/middleware/graphql";
import {translations} from './translations/translations'
import {registerTrs} from 'util/i18n.mjs'
import {getType} from '../../util/types.mjs'
import TypeHistory from './components/TypeHistory'

registerTrs(translations, 'HistoryTranslations')

// name of the pseudo field that renders the history tab in the edit form
const HISTORY_FIELD = 'historyTab__'
const HISTORY_TAB = 'TypeHistory.tab'

// same as in server.mjs: types without history entries
const TYPES_WITHOUT_HISTORY = ['History', 'Log', 'UserTracking', 'MailTracking', 'MailAccountMessage', 'MailAccountFolder',
    'CronJobExecution', 'MediaConversion', 'NewsletterSent', 'NewsletterTracking', 'SmsLog']

const hasHistory = (type) => {
    if (TYPES_WITHOUT_HISTORY.indexOf(type) >= 0) {
        return false
    }
    const typeDef = getType(type)
    return !(typeDef && typeDef.history === false)
}

// the fields object of the GenericForm in the dialog (hooks of other types replace the children with their own form)
const findFormFields = (children) => {
    if (!children) {
        return null
    }
    if (Array.isArray(children)) {
        for (const child of children) {
            const fields = findFormFields(child)
            if (fields) {
                return fields
            }
        }
        return null
    }
    if (children.props) {
        if (children.props.fields) {
            return children.props.fields
        }
        return findFormFields(children.props.children)
    }
    return null
}

export default () => {


    // add some extra data to the table
    Hook.on('TypeCreateEdit', function ({type, formFields, dataToEdit, props}) {

        if (type === 'History' && dataToEdit && dataToEdit.data) {

            if(dataToEdit.action === 'delete') {
                props.actions.unshift({key: 'restore', label: 'Wiederherstellen'})
            }
            formFields.prettyContent = {
                label: "Prettified",
                readOnly:true,
                tab:'Prettified',
                name: 'prettyContent',
                uitype: 'editor'
            }
            try{
                const json = JSON.parse(dataToEdit.data)
                dataToEdit.prettyContent = json.script
            }catch (e){
                console.log(e)
            }
        }
    })

    // tab with the changes of the entry in the edit dialog of every type.
    // order 100: runs after the hooks that replace the form (e.g. GenericData)
    Hook.on('TypeCreateEdit', function ({type, formFields, dataToEdit, props}) {
        if (!dataToEdit || !dataToEdit._id || !hasHistory(type)) {
            return
        }
        const fields = findFormFields(props.children) || formFields
        if (!fields || fields[HISTORY_FIELD]) {
            return
        }

        // a form without tabs gets a general tab, otherwise all fields would end up in "more options"
        const fieldKeys = Object.keys(fields)
        if (!fieldKeys.some(key => fields[key] && fields[key].tab)) {
            fieldKeys.forEach(key => {
                const field = fields[key]
                if (field && !field.noTab && field.placement !== 'header') {
                    fields[key] = Object.assign({}, field, {tab: 'elements.generalTab'})
                }
            })
        }

        // labels of the fields of the type (formFields always has all fields of the type)
        const fieldDefs = Object.assign({}, formFields, fields)

        fields[HISTORY_FIELD] = {
            name: HISTORY_FIELD,
            uitype: 'typeHistory',
            tab: HISTORY_TAB,
            label: '',
            fullWidth: true,
            historyType: type,
            historyId: dataToEdit._id,
            historyFieldDefs: fieldDefs,
            getCurrent: () => dataToEdit
        }
    }, 100)

    Hook.on('GenericFormField', function ({field, fieldKey, result}) {
        if (field.uitype === 'typeHistory') {
            result.component = <TypeHistory key={fieldKey}
                                            type={field.historyType}
                                            _id={field.historyId}
                                            fieldDefs={field.historyFieldDefs}
                                            getCurrent={field.getCurrent}/>
        }
    })

    // the pseudo field must never be saved
    Hook.on('TypeCreateEditBeforeSave', function ({editedData, optimisticData}) {
        if (editedData) {
            delete editedData[HISTORY_FIELD]
        }
        if (optimisticData) {
            delete optimisticData[HISTORY_FIELD]
        }
    })


    Hook.on('TypeCreateEditAction', function ({type, action, dataToEdit, meta}) {
        if (type === 'History' && action && dataToEdit) {
            if(action.key === 'restore') {

                client.query({
                    fetchPolicy: 'network-only',
                    query: `query importCollection($collection: String!, $json: String!, $meta: String){importCollection(collection:$collection,json:$json,meta:$meta){result}}`,
                    variables: {
                        collection: dataToEdit.type,
                        json: dataToEdit.data
                    }
                }).then(response => {
                    meta.TypeContainer.setState({simpleDialog: {children: 'Eintrag wurde wiederhergestellt'}})
                })
            }
        }
    })
}
