import React from 'react'
import Hook from 'util/hook'
import Async from 'client/components/Async'


const GenericForm = (props) => <Async {...props}
                                      load={import(/* webpackChunkName: "admin" */ '../../client/components/GenericForm')}/>


export default () => {


    Hook.on('TypeCreateEditDialog', function ({type, props, formFields, dataToEdit}) {
        if (type === 'GenericData' && dataToEdit && dataToEdit.definition) {

           // console.log(formFields,dataToEdit)


            const struct = JSON.parse(dataToEdit.definition.structure)

            const newFields = Object.assign({}, formFields, struct.fields)
            console.log(struct.fields)


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
                                          values={dataToEdit}/>


            //console.log(props, dataToEdit.definition.structure)
            //props.actions.unshift({key: 'run', label: 'Run CronJob'})
        }
    })


}
