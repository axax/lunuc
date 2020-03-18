import React from 'react'
import Hook from 'util/hook'
import Async from 'client/components/Async'
import {
    SimpleButton
} from 'ui/admin'

const GenericForm = (props) => <Async {...props}
                                      load={import(/* webpackChunkName: "admin" */ '../../client/components/GenericForm')}/>

const Typography = (props) => <Async {...props} expose="Typography"
                                     load={import(/* webpackChunkName: "admin" */ '../../gensrc/ui/admin')}/>

export default () => {


    // add some extra data to the table
    Hook.on('TypeTable', ({type, dataSource, data, container}) => {
        if (type === 'GenericData') {
            dataSource.forEach((d, i) => {


                if (d.data) {
                    const item = data.results[i]
                    try {
                        const json = JSON.parse(item.data)
                        if (json.title.constructor === String) {
                            d.data = json.title
                        }
                    } catch (e) {
                    }
                }
            })
        }
    })


    Hook.on('TypeCreateEdit', function ({type, props, formFields, dataToEdit, parentRef}) {

        if (type === 'GenericData') {

            if (dataToEdit && dataToEdit.definition) {

                let struct
                try {
                    struct = JSON.parse(dataToEdit.definition.structure)
                }catch (e) {
                    console.error(e, dataToEdit.definition.structure)
                    return
                }
                const data = dataToEdit.data.constructor === String ? JSON.parse(dataToEdit.data) : dataToEdit.data

                const newFields = Object.assign({}, formFields)
                const newDataToEdit = Object.assign({}, dataToEdit)

                delete newFields.data
                delete newDataToEdit.data

                newFields.definition.readOnly=true
                props.title=<React.Fragment>{newDataToEdit.definition.name} <div style={{float:'right',textAlign:'right'}}><SimpleButton size="small" variant="contained" color="primary"
                                                                                                                                         onClick={()=>{

                                                                                                                                             const a = document.createElement('a'),
                                                                                                                                                 blob = new Blob([JSON.stringify(JSON.parse(dataToEdit.data),null,4)], {'type':'text/plain'})
                                                                                                                                             a.href = window.URL.createObjectURL(blob)
                                                                                                                                            // a.download = 'json.txt'
                                                                                                                                             a.target='_blank'
                                                                                                                                             a.click()

                                                                                                                                         }}>Show JSON</SimpleButton></div></React.Fragment>

                struct.fields.forEach(field => {
                    const oriName = field.name, newName = 'data_' + oriName
                    field.name = newName
                    newFields[newName] = field
                    if (field.localized) {
                        newDataToEdit[newName] = data[oriName]
                    } else {
                        newDataToEdit[newName] = data[oriName] && data[oriName].constructor === Object ? JSON.stringify(data[oriName]) : data[oriName]
                    }
                    if( field.defaultValue && !newDataToEdit[newName]){
                        try {
                            newDataToEdit[newName] = eval(field.defaultValue)
                        }catch(e){
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
            } else {


                const newFields = Object.assign({}, formFields)
                newFields.definition.readOnly=false

                delete newFields.data

                // override default
                props.children = [<Typography key="GenericDataLabel" variant="subtitle1" gutterBottom>Please select a
                    generic type you want to create and press save.</Typography>,
                    <GenericForm key="genericForm" autoFocus innerRef={ref => {
                        parentRef.createEditForm = ref
                    }} onBlur={event => {
                        Hook.call('TypeCreateEditBlur', {type, event})
                    }} onChange={field => {
                    }} primaryButton={false} fields={newFields} values={dataToEdit}/>]
            }

        }
    })

    Hook.on('TypeCreateEditBeforeSave', function ({type, dataToEdit, formFields}) {
        if (type === 'GenericData' && dataToEdit && dataToEdit.definition) {

            const definition = dataToEdit.definition.constructor === Array ? dataToEdit.definition[0] : dataToEdit.definition

            const struct = JSON.parse(definition.structure)

            const data = {}
            struct.fields.forEach(field => {
                data[field.name] = dataToEdit['data_' + field.name]
                delete dataToEdit['data_' + field.name]
            })

            dataToEdit.data = JSON.stringify(data)


        }
    })

}
