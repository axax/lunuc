import React from 'react'
import Hook from 'util/hook.cjs'
import Async from '../../client/components/Async'
import {CAPABILITY_ADMIN_OPTIONS} from '../../util/capabilities.mjs'
import {_t, registerTrs} from '../../util/i18n.mjs'
import Util from '../../client/util/index.mjs'
import {translations} from './translations/admin'
registerTrs(translations, 'StaticFile')

const MultiUpload = (props) => <Async {...props}
                                      load={() => import(/* webpackChunkName: "admin" */ './components/MultiUpload')}/>

const FileDrop = (props) => <Async {...props}
                                   load={() =>import(/* webpackChunkName: "admin" */ '../../client/components/FileDrop')}/>

// the fields object of the GenericForm in the dialog (same helper as in the history extension)
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
    Hook.on('TypeTable', ({type, dataSource, data}) => {
        if (type === 'StaticFile') {
            dataSource.forEach((d, i) => {
                const item = data.results[i]

                if (item) {
                    d.name =
                        <a target="_blank" rel="noopener noreferrer" href={`/${item.name}`}>
                            {item.name}
                        </a>
                }
            })
        }
    })

    // upload field: a pseudo field in the general tab (so it is not shown in the other tabs, e.g. "Changes")
    const DROP_FIELD = 'fileDrop__'

    // order 200: runs after the history hook (order 100) which creates the tabs of the form
    Hook.on('TypeCreateEdit', function ({type, formFields, props, parentRef}) {
        if (type !== 'StaticFile') {
            return
        }
        const fields = findFormFields(props.children) || formFields
        if (!fields || fields[DROP_FIELD]) {
            return
        }
        const hasTabs = Object.keys(fields).some(key => fields[key] && fields[key].tab)
        fields[DROP_FIELD] = {
            name: DROP_FIELD,
            uitype: 'staticFileDrop',
            label: '',
            fullWidth: true,
            // without tabs (e.g. new entry) the field is shown in the plain form
            ...(hasTabs ? {tab: 'elements.generalTab'} : {}),
            getForm: () => parentRef.createEditForm
        }
    }, 200)

    Hook.on('GenericFormField', function ({field, fieldKey, result}) {
        if (field.uitype === 'staticFileDrop') {
            result.component = <FileDrop key={fieldKey}
                                         multi={false}
                                         accept="*/*"
                                         maxSize={10000}
                                         imagePreview={false}
                                         onDataUrl={(file, dataUrl) => {
                                             const form = field.getForm()
                                             form.handleInputChange({
                                                 target: {
                                                     name: 'content',
                                                     value: dataUrl
                                                 }
                                             })
                                         }}/>
        }
    })

    // the pseudo field must never be saved
    Hook.on('TypeCreateEditBeforeSave', function ({type, editedData, optimisticData}) {
        if (type === 'StaticFile') {
            if (editedData) {
                delete editedData[DROP_FIELD]
            }
            if (optimisticData) {
                delete optimisticData[DROP_FIELD]
            }
        }
    })

    // add some extra data to the table
    Hook.on('TypeTableAction', function ({type, actions}) {
        if (type === 'StaticFile') {



            if (Util.hasCapability({userData: _app_.user}, CAPABILITY_ADMIN_OPTIONS)) {
                actions.push({
                    divider: true,
                    icon: 'upload',
                    name: _t('StaticFile.multiUpload'),
                    onClick: () => {
                        let changed = false
                        this.setState({
                            simpleDialog: {
                                title: _t('StaticFile.multiUpload'),
                                maxWidth: 'lg',
                                fullWidth: true,
                                actions: [{key: 'close', label: 'OK'}],
                                onClose: () => {
                                    this.setState({simpleDialog: false})
                                    if (changed) {
                                        // reload table so new/replaced files show up
                                        this.getData(this.pageParams, false)
                                    }
                                },
                                children: <MultiUpload key="multiUpload"
                                                       type={type}
                                                       onUploaded={() => {
                                                           changed = true
                                                       }}/>
                            }
                        })
                    }
                })
            }
        }
    })

}
