import React, {useState} from 'react'
import Hook from 'util/hook'
import Async from '../../client/components/Async'

const FileDrop = (props) => <Async {...props}
                                   load={import(/* webpackChunkName: "admin" */ '../../client/components/FileDrop')}/>

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

    // add some extra data to the table
    Hook.on('TypeCreateEdit', function ({type, props, dataToEdit, meta, parentRef}) {
        if (type === 'StaticFile') {
            props.children = [props.children, <FileDrop key="fileDrop"
                                                        multi={false}
                                                        accept="*/*"
                                                        maxSize={10000}
                                                        imagePreview={false}
                                                        onDataUrl={(file,dataUrl) => {

                                                            const form = parentRef.createEditForm
                                                            form.setState({fields: {...form.state.fields, content:dataUrl}})
                                                        }}
                                                        label="Drop file here" />]
        }
    })

}
