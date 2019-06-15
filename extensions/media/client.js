import React, {useState} from 'react'
import Hook from 'util/hook'
import Async from 'client/components/Async'
import config from 'gen/config'

const {UPLOAD_URL} = config

const FileDrop = (props) => <Async {...props}
                                   load={import(/* webpackChunkName: "admin" */ '../../client/components/FileDrop')}/>
const TypePicker = (props) => <Async {...props}
                                     load={import(/* webpackChunkName: "admin" */ '../../client/components/TypePicker')}/>


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

            const MediaUploader = () => {
                const [conversion, setConversion] = useState(
                    []
                )

                const [group, setGroup] = useState(
                    []
                )
                return (
                    [
                        <div style={{position: 'relative', zIndex: 3}} key="typePicker">
                            <TypePicker onChange={(e) => {
                                setConversion(JSON.parse(e.target.value[0].conversion))
                            }} name="conversion" placeholder="Select a conversion"
                                        type="MediaConversion"/>

                            <TypePicker onChange={(e) => {
                                setGroup(e.target.value[0]._id)
                            }} name="conversion" placeholder="Select a group"
                                        type="MediaGroup"/>
                        </div>,
                        <FileDrop key="fileDrop" multi={true} conversion={conversion} accept="*/*"
                                  uploadTo="/graphql/upload" resizeImages={true}
                                  data={{group}}
                                  onSuccess={r => {
                                      this.setState({createEditDialog: false, createEditDialogParams: null})

                                      this.getData(this.pageParams, false)
                                      // TODO: but it directly into the store instead of reload
                                      //const queries = this.getQueries(type), storeKey = this.getStoreKey(type)


                                  }}/>]
                )
            }

            props.children = <MediaUploader/>
        }
    })


}
