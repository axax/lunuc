import React from 'react'
import Hook from 'util/hook'
import Async from 'client/components/Async'
import {
    SimpleSwitch,
    SimpleButton
} from 'ui/admin'
import Util from '../../client/util'
import {CAPABILITY_MANAGE_CMS_TEMPLATE} from '../cms/constants'
import {client} from 'client/middleware/graphql'
import config from 'gen/config-client'
import {_t, registerTrs} from '../../util/i18n'
import {performFieldProjection} from '../../util/project'

import {translations} from './translations/admin'
import {setPropertyByPath} from "../../client/util/json";

import {openWindow} from '../../client/util/window'

registerTrs(translations, 'GenericData')

const GenericForm = (props) => <Async {...props}
                                      load={import(/* webpackChunkName: "admin" */ '../../client/components/GenericForm')}/>

const Typography = (props) => <Async {...props} expose="Typography"
                                     load={import(/* webpackChunkName: "admin" */ '../../gensrc/ui/admin')}/>

export default () => {


    /*
        TypesContainer: gets called before the table is rendered

        add some extra data to the table
     */
    Hook.on('TypeTable', ({type, dataSource, data, container}) => {
        if (type === 'GenericData' && data.results.length > 0) {
            dataSource.forEach((row, i) => {
                const item = data.results[i],
                    structure = item.definition ? item.definition.structure : {}

                if (structure.titleTemplate) {
                    row.data = Util.replacePlaceholders(structure.titleTemplate, item)
                } else {

                    let pickerFields

                    if (structure.pickerField) {
                        // can be a String or an Array
                        pickerFields = structure.pickerField
                    } else if (item.data.title) {
                        // take title attribute if available
                        pickerFields = 'title'

                    } else {

                        // take the fist attribute of the object if none is specified
                        const keys = Object.keys(item.data)

                        if (keys.length > 0) {
                            pickerFields = keys[0]
                        }
                    }
                    if (pickerFields) {
                        if (pickerFields.constructor !== Array) {
                            pickerFields = [pickerFields]
                        }
                        row.data = ''
                        pickerFields.forEach(picker => {
                            if (item.data[picker]) {

                                let value

                                if (item.data[picker].constructor === Object) {
                                    //TODO it is not save to assume that it is a localized value
                                    value = item.data[picker][_app_.lang]
                                } else {
                                    value = item.data[picker]
                                }

                                if (value) {
                                    if (row.data) {
                                        row.data += ' | '
                                    }
                                    row.data += value
                                }
                            }
                        })

                        if (row.data.length > 83) {
                            row.data = row.data.substring(0, 80) + '...'
                        }
                    }
                }

            })
        }
    })


    Hook.on('TypeCreateEdit', function ({type, props, meta, formFields, dataToEdit, parentRef}) {
        if (type === 'GenericData') {

            if (!dataToEdit) {
                // create empty object
                dataToEdit = {}

                const data = meta.TypeContainer.state.data
                if (data.meta) {
                    dataToEdit.definition = JSON.parse(data.meta)
                }

                const {baseFilter} = Util.extractQueryParams(window.location.search.substring(1))

                // if there is a base filter set try to use its value to set as default when creating a new object
                if (baseFilter) {
                    const query = Util.extractQueryParams(baseFilter.replace(/==/g, '='))
                    Object.keys(query).forEach(key => {
                        const value = query[key]
                        if (value) {
                            setPropertyByPath(value, key, dataToEdit)
                        }
                    })
                }
            }


            if (!dataToEdit.definition && meta.TypeContainer.pageParams.meta) {
                dataToEdit.definition = meta.TypeContainer.pageParams.meta
            }

            if (dataToEdit.definition && (dataToEdit.definition.structure || dataToEdit.definition.constructor === String)) {
                if (!dataToEdit.definition.structure) {

                    client.query({
                        query: `query genericDataDefinitions($filter:String){genericDataDefinitions(filter:$filter){results{_id name structure}}}`,
                        variables: {
                            filter: `_id=${dataToEdit.definition} || name==${dataToEdit.definition}`
                        }
                    }).then(response => {
                        if (response.data.genericDataDefinitions.results) {

                            const definition = response.data.genericDataDefinitions.results[0]

                            let newDataToEdit = Object.assign({}, dataToEdit, {
                                definition: Object.assign({}, definition, {structure: JSON.parse(definition.structure)}),
                                createdBy: _app_.user
                            })


                            parentRef.setState({dataToEdit: newDataToEdit})
                        }
                    }).catch(error => {
                        console.error(error.message)
                    })
                    props.children = <React.Fragment>
                        loading structure...
                    </React.Fragment>

                } else {

                    const structure = dataToEdit.definition.structure,
                        dataObject = dataToEdit.data || {}


                    const newFields = Object.assign({}, formFields)
                    const newDataToEdit = Object.assign({}, dataToEdit)
                    delete newFields.data
                    delete newDataToEdit.data
                    newFields.definition.readOnly = true


                    let overrideTranslations = false, translateTimeout = 0
                    const userHasCapa = Util.hasCapability({userData: _app_.user}, CAPABILITY_MANAGE_CMS_TEMPLATE)

                    const actions = structure.actions
                    if (actions) {
                        props.actions.unshift(...structure.actions)
                    }

                    props.title = <React.Fragment>
                        {structure.title || newDataToEdit.definition.name}{newDataToEdit._id && userHasCapa ? ' (' + newDataToEdit._id + ')' : ''}
                        <div
                            style={{float: 'right', textAlign: 'right'}}>{userHasCapa && [<SimpleButton
                            key="showJson" size="small" variant="contained"
                            color="primary"
                            onClick={() => {

                                const a = document.createElement('a'),
                                    blob = new Blob([JSON.stringify(dataObject, null, 2)], {'type': 'text/plain'})
                                a.href = window.URL.createObjectURL(blob)
                                // a.download = 'json.txt'
                                a.target = '_blank'
                                a.click()

                            }}>Show JSON</SimpleButton>,
                            <SimpleButton key="autoTranslate" size="small" variant="contained"
                                          color="primary"
                                          onClick={() => {
                                              structure.fields.forEach(field => {
                                                  if (field.localized) {

                                                      const name = field.name

                                                      if (!dataObject[name]) {
                                                          dataObject[name] = newFields[name]
                                                      }
                                                      if (dataObject[name] && dataObject[name].constructor === String) {
                                                          dataObject[name] = {[config.DEFAULT_LANGUAGE]: dataObject[name]}
                                                      }

                                                      const obj = dataObject[name]
                                                      if (obj) {
                                                          config.LANGUAGES.forEach(lang => {
                                                              if ((overrideTranslations || !obj[lang]) && lang !== config.DEFAULT_LANGUAGE) {

                                                                  const text = obj[config.DEFAULT_LANGUAGE].replace(/\\n/g, '\n').replace(/%(\w+)%/g, '@_$1_')
                                                                  client.query({
                                                                      fetchPolicy: 'no-cache',
                                                                      query: 'query translate($text: String!, $toIso: String!){translate(text: $text, toIso: $toIso){text toIso}}',
                                                                      variables: {
                                                                          text,
                                                                          toIso: lang,
                                                                          fromIso: config.DEFAULT_LANGUAGE
                                                                      },
                                                                  }).then((res) => {
                                                                      const resLang = res.data.translate.toIso
                                                                      const newText = res.data.translate.text.replace(/@_(\w+)_/g, '%$1%').replace(/\\/g, '') //.replace(/"/g,'\\"')
                                                                      dataObject[name][resLang] = newText

                                                                      clearTimeout(translateTimeout)
                                                                      translateTimeout = setTimeout(() => {
                                                                          parentRef.setState({
                                                                              forceSave: true,
                                                                              dataToEdit: {
                                                                                  ...dataToEdit,
                                                                                  data: dataObject
                                                                              }
                                                                          })
                                                                      }, 1000)
                                                                  })

                                                              }
                                                          })
                                                      }
                                                  }
                                              })
                                          }}>Autotranslate
                            </SimpleButton>,
                            <SimpleSwitch key="overrideTranslations" label="Override Translations"
                                          name="overrideTranslations"
                                          onChange={(e) => {
                                              overrideTranslations = e.target.checked
                                          }}/>
                        ]}
                        </div>
                    </React.Fragment>

                    structure.fields.forEach((field) => {
                        const oriName = field.name, newName = 'data_' + oriName
                        newFields[newName] = Object.assign({}, field, {name: newName})


                        if (field.localized) {
                            newDataToEdit[newName] = dataObject[oriName]
                        } else {
                            newDataToEdit[newName] = dataObject[oriName] && dataObject[oriName].constructor === Object ? JSON.stringify(dataObject[oriName]) : dataObject[oriName]
                        }
                        if (field.defaultValue && !newDataToEdit[newName]) {
                            try {
                                newDataToEdit[newName] = eval(field.defaultValue)
                            } catch (e) {
                                newDataToEdit[newName] = field.defaultValue
                            }
                        }
                    })

                    // override default
                    props.children = <React.Fragment>
                        <GenericForm autoFocus
                                     innerRef={ref => {
                                         parentRef.createEditForm = ref
                                     }}
                                     onBlur={event => {
                                     }}
                                     onChange={field => {
                                     }}
                                     primaryButton={false}
                                     fields={newFields}
                                     trigger={structure.trigger}
                                     values={newDataToEdit}/>
                    </React.Fragment>
                }
            } else {

                const newFields = Object.assign({}, formFields)
                newFields.definition.readOnly = false

                delete newFields.data
                delete dataToEdit.definition
                // override default
                props.children = [<Typography key="GenericDataLabel" variant="subtitle1"
                                              gutterBottom>{_t('GenericData.createNewHint')}</Typography>,
                    <GenericForm key="genericForm" autoFocus innerRef={ref => {
                        parentRef.createEditForm = ref
                    }} onBlur={event => {
                        Hook.call('TypeCreateEditBlur', {type, event})
                    }} onChange={field => {
                    }} primaryButton={false} fields={newFields} values={dataToEdit}/>]
            }

        }
    })

    Hook.on('TypeCreateEditBeforeSave', function ({type, editedData, optimisticData, formFields}) {
        if (type === 'GenericData' && editedData && editedData.definition) {
            const definition = editedData.definition.constructor === Array ? editedData.definition[0] : editedData.definition,
                dataObject = {},
                optimisticDataObject = {}


            if (definition.structure.constructor === String) {
                definition.structure = JSON.parse(definition.structure)
            }

            // Combine data attributes to the data object
            definition.structure.fields.forEach(field => {

                if (field.genericType) {
                    // only keep reference _id
                    const fieldData = editedData['data_' + field.name]
                    if (fieldData && fieldData.constructor === Array && fieldData.length > 0 && fieldData[0]._id) {
                        if (field.metaFields) {
                            dataObject[field.name] = fieldData.map(e => ({_id: e._id, metaValues: e.metaValues}))
                        } else {
                            dataObject[field.name] = fieldData.map(e => e._id)
                        }
                    } else if (fieldData && fieldData._id) {
                        if (field.metaFields) {
                            dataObject[field.name] = {_id: fieldData._id, metaValues: fieldData.metaValues}
                        } else {
                            dataObject[field.name] = fieldData._id
                        }
                    } else {
                        dataObject[field.name] = editedData['data_' + field.name]
                    }
                    // we keep resolved values for the optimisticDataObject
                    optimisticDataObject[field.name] = editedData['data_' + field.name]
                } else {

                    let currentDataAttr
                    if (field.type === 'Object' && !(editedData['data_' + field.name] instanceof Object)) {
                        try {
                            currentDataAttr = JSON.parse(editedData['data_' + field.name])
                        } catch (e) {
                            console.log(e, field.name + ' -> ' + editedData['data_' + field.name])
                        }
                    } else {
                        currentDataAttr = editedData['data_' + field.name]
                    }
                    dataObject[field.name] = optimisticDataObject[field.name] = currentDataAttr
                }

                // delete data attribute
                delete editedData['data_' + field.name]
                delete optimisticData['data_' + field.name]
            })
            editedData.data = JSON.stringify(dataObject)
            optimisticData.data = optimisticDataObject

        }
    })


    /*
    Send the name of the generic type as meta data
     */
    Hook.on('TypeTableBeforeEdit', function ({type, data, variables}) {
        if (type === 'GenericData' && data.definition) {
            variables.meta = data.definition.name
        }
    })


    // add some extra data to the table
    Hook.on('TypeTableAction', function ({type, actions, pageParams}) {
        if (type === 'GenericData') {

            const filterdActions = actions.filter(f => f.key === 'export_csv')

            if (filterdActions.length > 0) {
                // replace cvs export function
                filterdActions[0].onClick = () => {
                    const items = []
                    this.state.data.results.forEach(res => {
                        items.push({date: Util.formattedDatetimeFromObjectId(res._id), ...res.data})
                    })
                    const header = Object.keys(items[0])
                    let csv = items.map(row => header.map(fieldName => {

                        let value = row[fieldName]
                        if (value) {
                            if (value.constructor === Array) {

                                value = value.map(item => {
                                    return item._id
                                })


                            } else if (value.constructor === Object) {
                                value = JSON.stringify(value)
                            }

                        } else {
                            value = ''
                        }
                        return '"' + Util.escapeForJson(value) + '"'
                    }).join(','))
                    csv.unshift(header.join(','))
                    csv = csv.join('\r\n')


                    const a = document.createElement('a'),
                        blob = new Blob([csv], {'type': 'text/comma-separated-values'})
                    a.href = window.URL.createObjectURL(blob)
                    a.download = (pageParams.title || 'export') + '.csv'
                    a.target = '_blank'
                    a.click()
                }
            }


        }
    })


    /*
        TypePicker: This gets called after the user picks items in a new window
        filter the object with only the attributes that are specified as pickerFields
     */
    Hook.on('TypePickerBeforeHandlePick', function ({type, pickerField, queryFields, fieldsToProject, projection, rawValue}) {

        if (type === 'GenericData') {

            let dataFieldsToProject

            if(fieldsToProject.length===0 && rawValue.definition && rawValue.definition.structure){
                dataFieldsToProject =  rawValue.definition.structure.pickerField
                if (dataFieldsToProject.constructor !== Array) {
                    dataFieldsToProject = [dataFieldsToProject]
                }
            }else{
                dataFieldsToProject = fieldsToProject.slice(0)
            }

            if(dataFieldsToProject && dataFieldsToProject.length>0){
                // project data
                try {
                    const newData = performFieldProjection(dataFieldsToProject, rawValue.data)

                    rawValue.data = newData
                    delete rawValue.definition
                } catch (e) {
                    console.log('Error in TypePickerBeforeHandlePick', e)
                }

                fieldsToProject.splice(0,fieldsToProject.length)
                fieldsToProject.push('_id')
                fieldsToProject.push('data')

            }
        }
    })


    /*
        TypePicker: This gets called before the query string is built
     */
    Hook.on('TypePickerBeforeQueryString', function ({type, finalFields}) {

        if (type === 'GenericData') {

            finalFields.splice(0,finalFields.length)

            finalFields.push('data')


        }
    })



    /*
      TypePicker: This gets called after the user types in the picker field and before data are loaded
   */
    Hook.on('TypePickerBeforeHandleChange', function ({value, searchFields, type}) {
        if (type === 'GenericData') {

            if (searchFields) {
                for (let i = 0; i < searchFields.length; i++) {
                    if (!searchFields[i].startsWith('data.')) {
                        searchFields[i] = 'data.' + searchFields[i]
                    }
                }
            }
        }
    })


    /*
      TypesContainer: This gets called before the filter dialog is shown
   */
    Hook.on('TypesContainerBeforeFilterDialog', function ({type, filterFields}) {
        if (type === 'GenericData') {
            if (this.state.data.meta) {
                const definition = JSON.parse(this.state.data.meta)
                definition.structure.fields.forEach(field => {
                    if (field.searchable) {
                        filterFields['data.' + field.name] = Object.assign({}, field, {tab: null, required: false})
                    }

                })
            }

        }
    })


    /*
      TypesContainer: This gets called before the filter dialog is shown
   */
    Hook.on('typeDataToLabel', function (context) {


        if (context.item.__typename === 'GenericData') {
            const definition = context.item.definition
            try {
                if (typeof context.item.data === 'object') {
                    context.item = context.item.data
                } else {
                    context.item = JSON.parse(context.item.data)
                }
            } catch (e) {
                console.log(e)
            }

            if (!context.pickerField) {
                if (definition) {
                    try {
                        context.pickerField = definition.structure.pickerField
                    } catch (e) {
                        console.log(e)
                    }
                }
            }
        }
    })


    Hook.on('TypeCreateEditAction', ({type, action, dataToEdit}) => {

        if (type==='GenericData' && action.url) {
            try {
                const actionStr = new Function('const data=this.data,Util=this.Util;return `' + JSON.stringify(action) + '`').call({
                    data: dataToEdit.data,
                    Util
                })
                const newAction = JSON.parse(actionStr)
                openWindow(newAction)

            } catch (e) {
                console.log('Error in actions', e)
            }
        }
    })


}
