import React, {useState} from 'react'
import Hook from 'util/hook'
import Async from 'client/components/Async'
import config from 'gen/config'
import Util from '../../client/util'
import DomUtil from '../../client/util/dom'
import {
    Row,
    Col,
    Button
} from 'ui/admin'

const {UPLOAD_URL, ADMIN_BASE_URL} = config
import _t from 'util/i18n'
import UploadUtil from '../../client/util/upload'
import {client} from 'client/middleware/graphql'

const FileDrop = (props) => <Async {...props}
                                   load={import(/* webpackChunkName: "admin" */ '../../client/components/FileDrop')}/>
const TypePicker = (props) => <Async {...props}
                                     load={import(/* webpackChunkName: "admin" */ '../../client/components/TypePicker')}/>
const SimpleSwitch = (props) => <Async {...props} expose="SimpleSwitch"
                                       load={import(/* webpackChunkName: "admin" */ '../../gensrc/ui/admin')}/>
const ImageIcon = (props) => <Async {...props} expose="ImageIcon"
                                    load={import(/* webpackChunkName: "admin" */ '../../gensrc/ui/admin')}/>

export default () => {
    let fileToUpload
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
                                    <img style={{maxWidth: '6rem', maxHeight: '6rem', objectFit: 'cover'}}
                                         src={item.src || (UPLOAD_URL + '/' + item._id + '?width=96')}/>
                                    :
                                    <div className="file-icon"
                                         data-type={mimeType.length > 1 ? mimeType[1] : 'doc'}></div>
                            )
                    if (window.opener) {
                        d.data = image
                    } else {
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

            actions.unshift(
                {
                    name: 'Create Media dump (current results)', onClick: () => {
                        const ids=[]
                        this.state.data.results.forEach(item => {
                          ids.push(item._id)
                        })
                        client.mutate({
                            mutation: `mutation createMediaDump($type:String,$ids:[ID]){createMediaDump(type:$type,ids:$ids){name createdAt size}}`,
                            variables: {ids},
                            update: (store, {data: {createMediaDump}}) => {
                                if (createMediaDump) {
                                    this.setState({simpleDialog: {children: createMediaDump.name}})
                                }
                            }
                        })
                    }
                },
                {
                    name: 'Find references for all medias', onClick: () => {
                        client.query({
                            fetchPolicy: 'network-only',
                            forceFetch: true,
                            query: '{findReferencesForMedia{status}}'
                        }).then(response => {
                            if (response.data && response.data.findReferencesForMedia) {
                                this.setState({simpleDialog: {children: response.data.findReferencesForMedia.status}})
                            }
                        })
                    }
                },
                {
                    name: 'CleanUp Medias', onClick: () => {
                        client.query({
                            fetchPolicy: 'network-only',
                            forceFetch: true,
                            query: '{cleanUpMedia{status}}'
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
        if (type === 'Media') {
            fileToUpload=false
            if (!dataToEdit && meta.option === 'upload') {
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
                                }} multi={true} name="group" placeholder={_t('Media.selectGroup')}
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
                                      maxSize={10000}
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
            } else if (dataToEdit) {
                const medieData = Util.getImageObject(dataToEdit)
                if (dataToEdit.mimeType.indexOf('image') === 0) {
                    props.children = [props.children,
                        <img key="mediaImage"
                             id="mediaImage"
                             style={{border: 'solid 0.4rem black', maxWidth: '100%', maxHeight: '20rem'}}
                             src={medieData.src}/>, <Button color="primary" variant="contained" key="mediaImageEdit" onClick={() => {
                            DomUtil.addScript('https://cdn.scaleflex.it/plugins/filerobot-image-editor/3.7.7/filerobot-image-editor.min.js', {
                                async: true,
                                onload: (e) => {
                                    e.preventDefault()
                                    const onComplete = function(data) {
                                        fileToUpload = data.canvas.toDataURL(dataToEdit.mimeType.substring(6), 0.85)
                                        Util.$('#mediaImage').src=fileToUpload
                                    }

                                    const ImageEditor = new FilerobotImageEditor({
                                        translations: {
                                            en: {
                                                'toolbar.download': 'Übernehmen'
                                            }
                                        },
                                        theme: {
                                            colors: {
                                                primaryBg: '#1e262c',
                                                primaryBgHover: '#637381',
                                                secondaryBg: '#263138',
                                                secondaryBgHover: '#34444c',
                                                text: '#F9FAFB',
                                                textHover: '#fff',
                                                textMute: '#aaa',
                                                textWarn: '#f7931e',
                                                secondaryBgOpacity: 'rgba(0, 0, 0, 0.75)',

                                                border: '#161e23',
                                                borderLight: '#70777f'
                                            }
                                        }
                                    },{onBeforeComplete:onComplete})

                                    ImageEditor.open(medieData.src)

                                }
                            })

                        }
                        }>Bild bearbeiten</Button>]
                        } else if (dataToEdit.mimeType.indexOf('video') === 0) {
                    let src = medieData.src
                    if (dataToEdit.mimeType === 'video/mpeg') {
                        src += '?ext=mp4&transcode={"audioQuality":2,"videoBitrate":800,"fps":25,"size":"640x?","crf":25}'
                    }
                    props.children = [props.children,
                        <video width="320" height="240" controls>
                            <source src={src} type={dataToEdit.mimeType}/>
                        </video>]
                } else if (dataToEdit.mimeType.indexOf('audio') === 0) {

                    props.children = [props.children,
                        <audio controls>
                            <source src={medieData.src + '?ext=mp3'} type={dataToEdit.mimeType}/>
                        </audio>]
                }
            }
        }
    })


    Hook.on('TypesContainerRender', function ({type, content}) {
        if (type === 'Media') {


            const QuickMediaUploader = () => {

                let info = ''
                const [group, setGroup] = useState(
                    this.settings.Media && this.settings.Media.group ? this.settings.Media.group : []
                )


                let groupIds = null

                if (group.length > 0) {
                    groupIds = []
                    group.forEach((g) => {
                        groupIds.push(g._id)
                    })

                }

                const media = this.settings.Media
                let conversion = null
                if (media && media.conversion && media.conversion.length > 0) {
                    conversion = JSON.parse(media.conversion[0].conversion)
                    info += ' Conversion=' + media.conversion[0].name
                }


                return <Row spacing={1} style={{marginBottom: '16px'}}>
                    <Col md={9}>
                        <FileDrop key="fileDrop" multi={true} accept="*/*"
                                  uploadTo="/graphql/upload"
                                  resizeImages={true}
                                  imagePreview={false}
                                  maxSize={10000}
                                  data={{group: groupIds}}
                                  conversion={conversion}
                                  onSuccess={r => {
                                      setTimeout(() => {
                                          this.getData(this.pageParams, false)
                                      }, 2000)
                                  }}/>
                    </Col>
                    <Col md={3}>

                        <TypePicker value={group} onChange={(e) => {
                            // meta._this.setSettingsForType(type, {group: e.target.value})
                            setGroup(e.target.value)
                        }} multi={true} name="group" placeholder={_t('Media.selectGroup')}
                                    type="MediaGroup"/>
                        <br/>
                        <small>{info}</small>
                    </Col>
                </Row>
            }

            content.splice(1, 1, <QuickMediaUploader key="quickMediaUploader"/>)
        }
    })

    Hook.on('TypeCreateEditBeforeSave', function ({type, dataToEdit, formFields}) {
        if (type === 'Media' && fileToUpload) {

            UploadUtil.uploadData({
                dataUrl:fileToUpload,
                data: {_id:dataToEdit._id},
                fileName: dataToEdit._id,
                uploadTo:'/graphql/upload',
                onProgress: ()=>{},
                onLoad: (e) => {

                },
                onError: (e) => {

                }
            })
            fileToUpload = false
            delete dataToEdit.upload
        }
    })

    // add entry to main menu
    Hook.on('MenuMenu', ({menuItems}) => {
        menuItems.push({name: 'Medias', to: ADMIN_BASE_URL + '/medias', auth: true, icon: <ImageIcon/>})
    })
}
