import React, {useState} from 'react'
import Hook from 'util/hook.cjs'
import {formatBytes} from "../../client/util/format.mjs";
import {client} from "../../client/middleware/graphql";


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


    Hook.on('TypeCreateEditAction', function ({type, action, dataToEdit, meta}) {
        if (type === 'History' && action && dataToEdit) {
            if(action.key === 'restore') {

                client.query({
                    fetchPolicy: 'network-only',
                    query: `query importCollection($collection: String!, $json: String!){importCollection(collection:$collection,json:$json){result}}`,
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

   /* Hook.on('TypeTable', ({type, dataSource, data}) => {
        if (type === 'History') {
            dataSource.forEach((d, i) => {
                const item = data.results[i]
                if (item && item.action==='delete' && item.meta) {
                    try {
                        const meta = JSON.parse(item.meta)
                        if(meta.name){
                            item.type = `${meta.name} (${item.type})`
                        }
                        console.log(item)
                    }catch (e){
                        console.log(e)
                    }
                }
            })
        }
    })*/

}
