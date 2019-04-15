import React from 'react'
import Hook from 'util/hook'
import FileDrop from 'client/components/FileDrop'
import TypePicker from 'client/components/TypePicker'

import config from 'gen/config'
const {UPLOAD_URL} = config

export default () => {

    // add an extra column for Media at the beginning
    Hook.on('TypeTableColumns', ({type, columns}) => {
        if (type === 'Media') {
            columns.splice(1, 0, {title: 'Data', id: 'data'})
        }
    })

    // add some extra data to the table
    Hook.on('TypeTable', ({type, dataSource, data, container}) => {
        if (type === 'Media') {
            dataSource.forEach((d, i) => {
                const item = data.results[i]
                const mimeType = item.mimeType ? item.mimeType.split('/') : ['file']

                d.data = <a target="_blank" rel="noopener noreferrer" href={item.src || (UPLOAD_URL + '/' + item._id)}>
                    {
                        (mimeType[0] === 'image' ?
                                <img height="40" src={item.src || (UPLOAD_URL + '/' + item._id)}/>
                                :
                                <div className="file-icon" data-type={mimeType.length > 1 ? mimeType[1] : 'doc'}></div>
                        )
                    }
                </a>
            })
        }
    })

    // add some extra data to the table
    Hook.on('TypeTableAction', function ({type, actions}) {
        if (type === 'Media') {

            actions.unshift({
                name: 'Upload new Media', onClick: () => {
                    setTimeout(() => {
                        this.setState({createEditDialog: true, createEditDialogParams: 'upload'})
                    }, 300)
                }
            })
        }
    })

    // add some extra data to the table
    Hook.on('TypeCreateEditDialog', function ({type, props, dataToEdit}) {
        if (type === 'Media' && !dataToEdit && this.state.createEditDialogParams === 'upload') {
            // remove save button
            props.actions.splice(1, 1)
            props.children = [
                <TypePicker key="typePicker" placeholder="Select a conversion" type="MediaConversion"/>,
                <FileDrop key="fileDrop" multi={false} accept="*/*" uploadTo="/graphql/upload" resizeImages={true}
                          onSuccess={r => {
                              this.setState({createEditDialog: false, createEditDialogParams: null})

                              this.getData(this.pageParams, false)
                              // TODO: but it directly into the store instead of reload
                              //const queries = this.getQueries(type), storeKey = this.getStoreKey(type)


                          }}/>]
        }
    })


}