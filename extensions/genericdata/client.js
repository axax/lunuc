import React from 'react'
import Hook from 'util/hook'
import Async from 'client/components/Async'


const GenericForm = (props) => <Async {...props}
                                      load={import(/* webpackChunkName: "admin" */ '../../client/components/GenericForm')}/>


export default () => {


    Hook.on('TypeCreateEditDialog', function ({type, props, formFields, dataToEdit}) {
        if (type === 'GenericData' && dataToEdit && dataToEdit.definition) {

            const struct = JSON.parse(dataToEdit.definition.structure),
                data = JSON.parse(dataToEdit.data)

            const newFields = Object.assign({}, formFields)
            const newDataToEdit = Object.assign({}, dataToEdit)

            delete newFields.data
            delete newDataToEdit.data

            struct.fields.forEach(field => {
                const oriName = field.name, newName= 'data_' + oriName
                field.fullWidth = true
                field.name = newName
                newFields[newName] = field
                newDataToEdit[newName] = data[oriName] && data[oriName].constructor === Object ? JSON.stringify(data[oriName]) : data[oriName]
            })

            // override default
            props.children = <GenericForm autoFocus
                                          innerRef={ref => {
                                              this.createEditForm = ref
                                          }}
                                          onBlur={event => {
                                          }}
                                          onChange={field => {
                                          }}
                                          primaryButton={false}
                                          fields={newFields}
                                          values={newDataToEdit}/>

        }
    })

    Hook.on('TypeCreateEditDialogBeforeSave', function ({type, dataToEdit, formFields}) {
        if (type === 'GenericData' && dataToEdit && dataToEdit.definition) {

            const struct = JSON.parse(dataToEdit.definition.structure)

            const data = {}

            struct.fields.forEach(field => {
                data[field.name] = dataToEdit['data_' + field.name]
                delete dataToEdit['data_' + field.name]
            })

            dataToEdit.data = JSON.stringify(data, null, 4)


        }
    })

}
