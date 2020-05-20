import React, {useState} from 'react'
import Hook from 'util/hook'
import Async from 'client/components/Async'
import config from 'gen/config'
import {gql} from '@apollo/client'
import Util from '../../client/util'
const {UPLOAD_URL,ADMIN_BASE_URL} = config

const FileDrop = (props) => <Async {...props}
                                   load={import(/* webpackChunkName: "admin" */ '../../client/components/FileDrop')}/>
const TypePicker = (props) => <Async {...props}
                                     load={import(/* webpackChunkName: "admin" */ '../../client/components/TypePicker')}/>
const SimpleSwitch = (props) => <Async {...props} expose="SimpleSwitch"
                                       load={import(/* webpackChunkName: "admin" */ '../../gensrc/ui/admin')}/>
const ImageIcon = (props) => <Async {...props} expose="ImageIcon"
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
                    const mimeType = item.mimeType ? item.mimeType.split('/') : ['file'],
                        image =
                            (mimeType[0] === 'image' ?
                                    <img style={{maxWidth: '6rem', maxHeight: '6rem', objectFit:'cover'}} src={item.src || (UPLOAD_URL + '/' + item._id)}/>
                                    :
                                    <div className="file-icon"
                                         data-type={mimeType.length > 1 ? mimeType[1] : 'doc'}></div>
                            )
                    if (window.opener) {
                        d.data = image
                    }else {
                        d.data =
                            <a target="_blank" onDoubleClick={(e) => {
                                e.preventDefault()
                            }} rel="noopener noreferrer" href={item.src || (UPLOAD_URL + '/' + item._id)}>
                                {image}
                            </a>
                    }
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
                            if (response.data && response.data.cleanUpMedia) {
                                this.setState({simpleDialog: {children: response.data.cleanUpMedia.status}})
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
        if (type === 'Media' ) {

            if(!dataToEdit && meta.option === 'upload') {
                // remove save button
                props.actions.splice(1, 1)

                const MediaUploader = () => {

                    const [conversion, setConversion] = useState(
                        meta._this.settings.Media && meta._this.settings.Media.conversion ? meta._this.settings.Media.conversion : []
                    )

                    const [group, setGroup] = useState(
                        meta._this.settings.Media && meta._this.settings.Media.group ? meta._this.settings.Media.group : []
                    )

                    const [useCdn, setUseCdn] = useState(
                        false
                    )

                    const groupIds = []
                    group.forEach(value => {
                        groupIds.push(value._id)
                    })

                    return (
                        [
                            <div style={{position: 'relative', zIndex: 3}} key="typePicker">
                                <TypePicker value={conversion} onChange={(e) => {
                                    setConversion(e.target.value)
                                    meta._this.setSettingsForType(type, {conversion: e.target.value})

                                }} name="conversion" placeholder="Select a conversion"
                                            type="MediaConversion"/>

                                <TypePicker value={group} onChange={(e) => {
                                    meta._this.setSettingsForType(type, {group: e.target.value})
                                    setGroup(e.target.value)
                                }} multi={true} name="group" placeholder="Select a group"
                                            type="MediaGroup"/>
                            </div>,
                            <SimpleSwitch key="useCdn" label="Upload file to CDN" name="useCdn"
                                          onChange={(e) => {
                                              setUseCdn(e.target.checked)
                                          }} checked={useCdn}/>,
                            <FileDrop key="fileDrop" multi={true}
                                      conversion={conversion && conversion.length > 0 ? JSON.parse(conversion[0].conversion) : null}
                                      accept="*/*"
                                      uploadTo="/graphql/upload" resizeImages={true}
                                      data={{group: groupIds, useCdn}}
                                      maxSize={3000}
                                      imagePreview={false}
                                      onSuccess={r => {
                                          if (meta._this) {
                                              setTimeout(() => {
                                                  meta._this.setState({
                                                      createEditDialog: false,
                                                      createEditDialogOption: null
                                                  })

                                                  meta._this.getData(meta, false)
                                              }, 1000)

                                          }
                                          // TODO: but it directly into the store instead of reload
                                          //const queries = this.getQueries(type), storeKey = this.getStoreKey(type)


                                      }}/>]
                    )
                }

                props.children = <MediaUploader/>
            }else if( dataToEdit ){
                const medieData = Util.getImageObject(dataToEdit)
                if(dataToEdit.mimeType.indexOf('image')===0) {
                    props.children = [props.children,
                        <img style={{border: 'solid 0.4rem black', maxWidth: '100%', maxHeight: '20rem'}}
                             src={medieData.src}/>]
                }else if(dataToEdit.mimeType.indexOf('video')===0) {
                    props.children = [props.children,
                        <video width="320" height="240" controls>
                            <source src={medieData.src} type="video/mp4" />
                        </video>]
                }
            }
        }
    })




    Hook.on('TypesContainerRender', function ({type, content}) {
        if (type === 'Media'){
            let info=''
            let group = null
            if( this.settings.Media ){
                if(this.settings.Media.group){
                    info += ' Group='+this.settings.Media.group[0].name
                    group = []
                    this.settings.Media.group.forEach((g)=>{
                        group.push(g._id)
                    })

                }
                if(this.settings.Media.conversion){
                    info += ' Conversion='+this.settings.Media.conversion[0].name
                }
            }
            content.splice(1, 1,<FileDrop key="fileDrop" multi={true} accept="*/*"
                                          uploadTo="/graphql/upload"
                                          resizeImages={true}
                                          imagePreview={false}
                                          maxSize={3000}
                                          data={{group}}
                                          conversion={this.settings.Media && this.settings.Media.conversion? this.settings.Media.conversion: null}
                                          onSuccess={r => {
                                              setTimeout(()=> {
                                                  this.getData(this.pageParams, false)
                                              },1000)
                                          }}/>,<small>{info}</small>)
        }
    })


    // add entry to main menu
    Hook.on('MenuMenu', ({menuItems}) => {
        menuItems.push({name: 'Medias', to: ADMIN_BASE_URL + '/medias', auth: true, icon: <ImageIcon/>})
    })
}
