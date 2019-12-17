import React from 'react'
import Hook from 'util/hook'
import Async from 'client/components/Async'


const GenericForm = (props) => <Async {...props}
                                      load={import(/* webpackChunkName: "admin" */ '../../client/components/GenericForm')}/>

const Typography = (props) => <Async {...props} expose="Typography"
                                     load={import(/* webpackChunkName: "admin" */ '../../gensrc/ui/admin')}/>


export default () => {


    // add some extra data to the table
    Hook.on('TypeTable', ({type, dataSource, data, container}) => {
        if (type === 'GenericData') {
            dataSource.forEach((d, i) => {


                if (d.data ) {
                    const item = data.results[i]
                    try {
                        const json = JSON.parse(item.data)
                        if( json.title.constructor===String) {
                            d.data = json.title
                        }
                    }catch(e){}
                }
            })
        }
    })

    Hook.on('TypeCreateEdit', function ({type, props, formFields, dataToEdit, parentRef}) {

        if (type === 'GenericData') {

            if(  dataToEdit && dataToEdit.definition ) {

                const struct = JSON.parse(dataToEdit.definition.structure)

                const data = dataToEdit.data.constructor === String ? JSON.parse(dataToEdit.data) : dataToEdit.data

                const newFields = Object.assign({}, formFields)
                const newDataToEdit = Object.assign({}, dataToEdit)

                delete newFields.data
                delete newDataToEdit.data

                struct.fields.forEach(field => {
                    const oriName = field.name, newName = 'data_' + oriName
                    field.fullWidth = true
                    field.name = newName
                    newFields[newName] = field
                    if( field.localized){
                        newDataToEdit[newName] = data[oriName]
                    }else{
                        newDataToEdit[newName] = data[oriName] && data[oriName].constructor === Object ? JSON.stringify(data[oriName]) : data[oriName]
                    }
                })

                // override default
                props.children = <GenericForm autoFocus
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
            }else{


                const newFields = Object.assign({}, formFields)

                delete newFields.data

                // override default
                props.children = [<Typography key="GenericDataLabel" variant="subtitle1" gutterBottom>Please select a generic type you want to create.</Typography>,
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
