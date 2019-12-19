import React, {useState} from 'react'
import Hook from 'util/hook'
import Async from 'client/components/Async'
import config from 'gen/config'
import gql from 'graphql-tag'

const {UPLOAD_URL} = config

const FileDrop = (props) => <Async {...props}
                                   load={import(/* webpackChunkName: "admin" */ '../../client/components/FileDrop')}/>
const TypePicker = (props) => <Async {...props}
                                     load={import(/* webpackChunkName: "admin" */ '../../client/components/TypePicker')}/>
const SimpleSwitch = (props) => <Async {...props} expose="SimpleSwitch"
                                       load={import(/* webpackChunkName: "admin" */ '../../gensrc/ui/admin')}/>

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
                if (item) {
                    const mimeType = item.mimeType ? item.mimeType.split('/') : ['file']

                    d.data =
                        <a target="_blank" rel="noopener noreferrer" href={item.src || (UPLOAD_URL + '/' + item._id)}>
                            {
                                (mimeType[0] === 'image' ?
                                        <img height="40" src={item.src || (UPLOAD_URL + '/' + item._id)}/>
                                        :
                                        <div className="file-icon"
                                             data-type={mimeType.length > 1 ? mimeType[1] : 'doc'}></div>
                                )
                            }
                        </a>
                }
            })
        }
    })

    // add some extra data to the table
    Hook.on('TypeTableAction', function ({type, actions}) {
        if (type === 'Media') {

            actions.unshift({
                    name: 'CleanUp Medias', onClick: () => {
                        this.props.client.query({
                            fetchPolicy: 'network-only',
                            forceFetch: true,
                            query: gql('{cleanUpMedia{status}}')
                        }).then(response => {
                            if(response.data && response.data.cleanUpMedia) {
                                this.setState({simpleDialog: response.data.cleanUpMedia.status})
                            }
                        })
                    }
                },
                {
                    name: 'Upload new Media', onClick: () => {
                        setTimeout(() => {
                            this.setState({createEditDialog: true, createEditDialogOption: 'upload'})
                        }, 300)
                    }
                })
        }
    })

    // add some extra data to the table
    Hook.on('TypeCreateEdit', function ({type, props, dataToEdit, meta}) {
        if (type === 'Media' && !dataToEdit && meta.option === 'upload') {
            // remove save button
            props.actions.splice(1, 1)

            const MediaUploader = () => {
                const [conversion, setConversion] = useState(
                    []
                )

                const [group, setGroup] = useState(
                    []
                )

                const [useCdn, setUseCdn] = useState(
                    true
                )
                return (
                    [
                        <div style={{position: 'relative', zIndex: 3}} key="typePicker">
                            <TypePicker onChange={(e) => {
                                setConversion(e.target.value && e.target.value.length ? JSON.parse(e.target.value[0].conversion) : null)
                            }} name="conversion" placeholder="Select a conversion"
                                        type="MediaConversion"/>

                            <TypePicker onChange={(e) => {
                                const groups = []
                                e.target.value.forEach(value => {
                                    groups.push(value._id)
                                })
                                setGroup(groups)
                            }} multi={true} name="group" placeholder="Select a group"
                                        type="MediaGroup"/>
                        </div>,
                        <SimpleSwitch key="useCdn" label="Upload file to CDN" name="useCdn"
                                      onChange={(e) => {
                                          setUseCdn(e.target.checked)
                                      }} checked={useCdn}/>,
                        <FileDrop key="fileDrop" multi={true} conversion={conversion} accept="*/*"
                                  uploadTo="/graphql/upload" resizeImages={true}
                                  data={{group, useCdn}}
                                  onSuccess={r => {
                                      if (meta._this) {
                                          meta._this.setState({createEditDialog: false, createEditDialogOption: null})

                                          meta._this.getData(meta, false)
                                      }
                                      // TODO: but it directly into the store instead of reload
                                      //const queries = this.getQueries(type), storeKey = this.getStoreKey(type)


                                  }}/>]
                )
            }

            props.children = <MediaUploader/>
        }
    })


}
