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

import {translations} from './translations/admin'

registerTrs(translations, 'GenericData')

const GenericForm = (props) => <Async {...props}
                                      load={import(/* webpackChunkName: "admin" */ '../../client/components/GenericForm')}/>

const Typography = (props) => <Async {...props} expose="Typography"
                                     load={import(/* webpackChunkName: "admin" */ '../../gensrc/ui/admin')}/>

export default () => {


    // add some extra data to the table
    Hook.on('TypeTable', ({type, dataSource, data, container}) => {
        if (type === 'GenericData' && data.results.length > 0) {
            dataSource.forEach((d, i) => {

                if (d.data) {
                    const item = data.results[i]
                    try {
                        const structur = JSON.parse(item.definition.structure)

                        const json = JSON.parse(item.data)
                        if (structur.pickerField) {
                            let picker = structur.pickerField
                            if (structur.pickerField.constructor === Array) {
                                picker = structur.pickerField[0]
                            }
                            if (json[picker].constructor === String) {
                                d.data = json[picker]
                            } else {
                                d.data = json[picker][_app_.lang]
                            }
                        } else {

                            if (json.title.constructor === String) {
                                d.data = json.title
                            } else {
                                d.data = json.title[_app_.lang]
                            }
                        }
                    } catch (e) {
                    }
                }
            })
        }
    })


    Hook.on('TypeCreateEdit', function ({type, props, meta, formFields, dataToEdit, parentRef}) {
        if (type === 'GenericData') {

            if((!dataToEdit || !dataToEdit.definition) && meta && meta.baseFilter){
                let b = decodeURIComponent(meta.baseFilter)
                if(b.startsWith('definition')){
                    b = b.substring(11)

                    dataToEdit = Object.assign({},dataToEdit)

                    if(b.startsWith('name')){
                        b = b.substring(5)
                    }else  if(b.startsWith('_id')){
                        b = b.substring(3)
                    }
                    if(b.startsWith('=')){
                        b = b.substring(1)
                    }
                    dataToEdit.definition = b

                }
            }




            if (dataToEdit && dataToEdit.definition) {

                if (!dataToEdit.definition.structure) {

                    client.query({
                        query: `query genericDataDefinitions($filter:String){genericDataDefinitions(filter:$filter){results{_id name structure}}}`,
                        variables: {
                            filter: `_id=${dataToEdit.definition} || name==${dataToEdit.definition}`
                        }
                    }).then(response => {
                        if (response.data.genericDataDefinitions.results) {
                            let newDataToEdit = Object.assign({}, dataToEdit, {definition: response.data.genericDataDefinitions.results[0], createdBy:_app_.user})

                            parentRef.setState({dataToEdit: newDataToEdit})
                        }
                    }).catch(error => {
                        console.error(error.message)
                    })
                    props.children = <React.Fragment>
                        loading structure...
                    </React.Fragment>

                } else {

                    let struct
                    try {
                        struct = JSON.parse(dataToEdit.definition.structure)
                    } catch (e) {
                        console.error(e, dataToEdit.definition.structure)
                        return
                    }
                    const data = dataToEdit.data ? (dataToEdit.data.constructor === String ? JSON.parse(dataToEdit.data) : dataToEdit.data) : {}

                    const newFields = Object.assign({}, formFields)

                    const newDataToEdit = Object.assign({}, dataToEdit)
                    delete newFields.data
                    delete newDataToEdit.data

                    let overrideTranslations = false, translateTimeout = 0
                    newFields.definition.readOnly = true
                    const userHasCapa = Util.hasCapability({userData: _app_.user}, CAPABILITY_MANAGE_CMS_TEMPLATE)
                    props.title = <React.Fragment>
                        {struct.title || newDataToEdit.definition.name}{newDataToEdit._id && userHasCapa ? ' (' + newDataToEdit._id + ')' : ''}
                        <div
                            style={{float: 'right', textAlign: 'right'}}>{userHasCapa && [<SimpleButton
                            key="showJson" size="small" variant="contained"
                            color="primary"
                            onClick={() => {

                                const a = document.createElement('a'),
                                    blob = new Blob([JSON.stringify(JSON.parse(dataToEdit.data), null, 2)], {'type': 'text/plain'})
                                a.href = window.URL.createObjectURL(blob)
                                // a.download = 'json.txt'
                                a.target = '_blank'
                                a.click()

                            }}>Show JSON</SimpleButton>,
                            <SimpleButton key="autoTranslate" size="small" variant="contained"
                                          color="primary"
                                          onClick={() => {
                                              const json = JSON.parse(dataToEdit.data)

                                              struct.fields.forEach(field => {
                                                  if (field.localized) {

                                                      const name = field.name.split('_')[1]

                                                      if (json[name] && json[name].constructor === String) {
                                                          json[name] = {[config.DEFAULT_LANGUAGE]: json[name]}
                                                      }

                                                      const obj = json[name]

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
                                                                      json[name][resLang] = newText
                                                                      /*dataToEdit.data = JSON.stringify(json)*/
                                                                      clearTimeout(translateTimeout)
                                                                      translateTimeout = setTimeout(() => {
                                                                          parentRef.setState({
                                                                              forceSave: true,
                                                                              dataToEdit: {
                                                                                  ...dataToEdit,
                                                                                  data: JSON.stringify(json)
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

                    struct.fields.forEach((field) => {
                        const oriName = field.name, newName = 'data_' + oriName
                        field.name = newName
                        newFields[newName] = field
                        if (field.localized) {
                            newDataToEdit[newName] = data[oriName]
                        } else {
                            newDataToEdit[newName] = data[oriName] && data[oriName].constructor === Object ? JSON.stringify(data[oriName]) : data[oriName]
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
                                     values={newDataToEdit}/>
                    </React.Fragment>
                }
            } else {

                const newFields = Object.assign({}, formFields)
                newFields.definition.readOnly = false

                delete newFields.data
                // override default
                props.children = [<Typography key="GenericDataLabel" variant="subtitle1" gutterBottom>{_t('GenericData.createNewHint')}</Typography>,
                    <GenericForm key="genericForm" autoFocus innerRef={ref => {
                        parentRef.createEditForm = ref
                    }} onBlur={event => {
                        Hook.call('TypeCreateEditBlur', {type, event})
                    }} onChange={field => {
                    }} primaryButton={false} fields={newFields} values={dataToEdit}/>]
            }

        }
    })

    Hook.on('TypeCreateEditBeforeSave', function ({type, editedData, formFields}) {
        if (type === 'GenericData' && editedData && editedData.definition) {

            const definition = editedData.definition.constructor === Array ? editedData.definition[0] : editedData.definition

            const struct = JSON.parse(definition.structure)
            const data = {}
            struct.fields.forEach(field => {
                if (field.genericType) {
                    // only keep reference _id
                    const fieldData = editedData['data_' + field.name]
                    if (fieldData && fieldData.constructor === Array && fieldData.length > 0 && fieldData[0]._id) {
                        data[field.name] = fieldData.map(e => e._id)
                    } else if (fieldData && fieldData._id) {
                        data[field.name] = fieldData._id
                    } else {
                        data[field.name] = editedData['data_' + field.name]
                    }
                } else {
                    if (field.type === 'Object') {
                        data[field.name] = JSON.parse(editedData['data_' + field.name])
                    } else {
                        data[field.name] = editedData['data_' + field.name]
                    }
                }
                delete editedData['data_' + field.name]
            })
            editedData.data = JSON.stringify(data)


        }
    })


    Hook.on('TypeTableBeforeEdit', function ({type, data, fieldsToLoad, variables}) {
        if (type === 'GenericData' && data.definition) {

            const struct = JSON.parse(data.definition.structure)
            for (let i = 0; i < struct.fields.length; i++) {
                const field = struct.fields[i]
                if (field.genericType) {
                    fieldsToLoad.push('data') //load
                    variables.meta = data.definition.name
                    return
                }
            }


        }
    })


    // add some extra data to the table
    Hook.on('TypeTableAction', function ({type, actions}) {
        if (type === 'GenericData') {

            actions.push({
                name: 'Export GenericData to csv', onClick: () => {
                    const items = []
                    this.state.data.results.forEach(res => {
                        items.push({date: Util.formattedDatetimeFromObjectId(res._id), ...JSON.parse(res.data)})
                    })
                    const replacer = (key, value) => value === null ? '' : value // specify how you want to handle null values here
                    const header = Object.keys(items[0])
                    let csv = items.map(row => header.map(fieldName => JSON.stringify(row[fieldName], replacer)).join(','))
                    csv.unshift(header.join(','))
                    csv = csv.join('\r\n')


                    const a = document.createElement('a'),
                        blob = new Blob([csv], {'type': 'text/comma-separated-values'})
                    a.href = window.URL.createObjectURL(blob)
                    a.download = 'genericdata.csv'
                    a.target = '_blank'
                    a.click()
                }
            })
        }
    })

    Hook.on('TypePickerWindowCallback', function ({type, value}) {
        if (type === 'GenericData' && value.definition) {
            try {
                const structure = JSON.parse(value.definition.structure)

                if (structure.pickerField) {
                    const data = JSON.parse(value.data)
                    const newData = {}

                    const pickerFields = structure.pickerField.constructor === Array ? structure.pickerField : [structure.pickerField]
                    for (const pickerField of pickerFields) {
                        newData[pickerField] = data[pickerField]
                    }

                    value.data = JSON.stringify(newData)
                    delete value.definition
                }
            } catch (e) {
                console.log('Error in TypePickerWindowCallback', e)
            }
        }
    })

}
