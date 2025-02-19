import React, {useState} from 'react'
import Hook from 'util/hook.cjs'
import Async from 'client/components/Async'
import config from 'gen/config-client'
import Util from '../../client/util/index.mjs'
import DomUtil from '../../client/util/dom.mjs'
import {
    Row,
    Col,
    Button,
    SimpleTab,
    SimpleTabPanel,
    SimpleTabs,
    Box,
    Paper
} from 'ui/admin'

const {UPLOAD_URL, ADMIN_BASE_URL, PRETTYURL_SEPERATOR} = config
import {_t, registerTrs} from 'util/i18n.mjs'
import UploadUtil from '../../client/util/upload'
import {client} from 'client/middleware/graphql'
import {translations} from './translations/translations'
import {CAPABILITY_MANAGE_OTHER_USERS, CAPABILITY_ADMIN_OPTIONS} from '../../util/capabilities.mjs'
import {formatBytes} from '../../client/util/format.mjs'

registerTrs(translations, 'MediaTranslations')

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
                    if(d.size && item.size){

                        d.size = formatBytes(item.size)
                    }
                    const mimeType = item.mimeType ? item.mimeType.split('/') : ['file'],
                        image =
                            (mimeType[0] === 'image' ?
                                    <img style={{maxWidth: '6rem', maxHeight: '6rem', objectFit: 'cover'}}
                                         src={item.src || `${UPLOAD_URL}/${item._id}/${PRETTYURL_SEPERATOR}/${item.name}${item.mimeType.indexOf('svg')<0?'?format=webp&quality=50&width=96&remoteserver=false':'?remoteserver=false'}`}/>
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
                            }} rel="noopener noreferrer"
                               href={item.src || `${UPLOAD_URL}/${item._id}/${PRETTYURL_SEPERATOR}/${item.name}`}>
                                {image}
                            </a>
                    }
                }
            })
        }
    })

    // add some extra data to the table
    Hook.on('TypeTableAction', function ({type, multiSelectActions, actions}) {
        if (type === 'Media') {

            multiSelectActions.unshift({name: 'Download', value: 'download'})


            if(Util.hasCapability({userData: _app_.user}, CAPABILITY_ADMIN_OPTIONS)){
                multiSelectActions.push( {name: _t('TypesContainer.deleteOnlyFile'), value: 'deleteOnlyFile'})
            }

            const userCanManageOtherUser = Util.hasCapability({userData: _app_.user}, CAPABILITY_MANAGE_OTHER_USERS)

            if (userCanManageOtherUser) {
                actions.unshift(
                    {
                        name: 'Create Media dump (current results)', onClick: () => {
                            const ids = []
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
                        name: _t('Media.cleanupMedia'), onClick: () => {
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
                    })
            }

            actions.unshift(
                {
                    icon:'upload',
                    name: _t('Media.uploadMedia'), onClick: () => {
                        setTimeout(() => {
                            this.setState({createEditDialog: true, createEditDialogOption: 'upload'})
                        }, 300)
                    }
                })
        }
    })


    Hook.on('TypeTableMultiSelectAction', function ({action, data, selectedRows, meta}) {
        if(action === 'download'){
            Object.keys(selectedRows).forEach(id=>{
                const item = data.results.find(f=>f._id===id)
                if(item) {
                    const a = document.createElement("a")
                    a.setAttribute('href', `${UPLOAD_URL}/${item._id}`)
                    a.setAttribute('download', item.name)
                    a.setAttribute('target', '_blank')
                    a.click()
                }
            })
            //downloadAll(files)
        }else if(action === 'deleteOnlyFile'){
            const dataToDelete = Object.keys(selectedRows)
            this.setState({confirmDialog: {
                    title:_t('TypesContainer.deleteConfirmTitle'),
                    text:<>{(dataToDelete.length > 1 ? _t('TypesContainer.deleteConfirmTextMulti') : _t('TypesContainer.deleteConfirmText'))}
                        <p><strong>{_t('TypesContainer.deleteConfirmTextOnlyFile')}</strong></p></>,
                    action:'deleteOnlyFile', open:true,payload:dataToDelete}})
        }
    })


    Hook.on('TypeContainerConfirmDialog', function ({type, confirmDialog, action}) {
        if (type === 'Media' && action.key==='yes' && confirmDialog.action==='deleteOnlyFile') {
            client.query({
                query: `query deleteOnlyMediaFiles($_id:[ID]){deleteOnlyMediaFiles(_id: $_id){_id status}}`,
                variables: {
                    _id: confirmDialog.payload
                }}).then(response => {
                    if (response.data && response.data.deleteOnlyMediaFiles) {
                        const fileTypes = {}
                        response.data.deleteOnlyMediaFiles.forEach(file=>{
                            if(!fileTypes[file.status]){
                                fileTypes[file.status]=0
                            }
                            fileTypes[file.status]++
                        })
                        this.setState({simpleDialog: {children: Object.keys(fileTypes).map(key=><p>{key}: {fileTypes[key]}</p>)}})
                    }
                }).catch((error)=>{})
        }
    })

    Hook.on('TypeCreateEditAction', function ({type, action, dataToEdit, meta}) {
        if (type === 'Media' && action && dataToEdit) {
            if(action.key === 'clearConversions') {
                client.query({
                    fetchPolicy: 'network-only',
                    forceFetch: true,
                    variables: {ids: [dataToEdit._id]},
                    query: 'query cleanUpMedia($ids:[String]){cleanUpMedia(ids:$ids){status}}'
                }).then(response => {
                    if (response.data && response.data.cleanUpMedia) {
                        if (meta && meta.TypeContainer) {
                            meta.TypeContainer.setState({simpleDialog: {children: response.data.cleanUpMedia.status}})
                        }
                    }
                })
            }
        }
    })


    Hook.on('GenericFormField', function ({field, value, result}) {
        if (field.uitype === 'mediaReferences') {
            const btn = <Button color="secondary" onClick={() => {
                client.query({
                    fetchPolicy: 'network-only',
                    forceFetch: true,
                    variables: {ids: [this.state.valuesOri._id]},
                    query: 'query findReferencesForMedia($ids:[ID]){findReferencesForMedia(ids:$ids){status}}'
                }).then(response => {
                    if (response.data && response.data.findReferencesForMedia) {
                        const json = JSON.parse(response.data.findReferencesForMedia.status)
                        this.handleInputChange({target: {name: field.name, value: JSON.stringify(json.items[this.state.valuesOri._id].references)}})
                    }
                })
            }} variant="contained">Verwendung prüfen</Button>
            if(value) {
                const json = JSON.parse(value)
                result.component = <div>
                    <p><span>Letzte Überprüfung:</span> <strong>{Util.formatDate(json.lastChecked)}</strong></p>
                    {
                        json.locations.length===0?<p>Media wird nicht verwendet</p>:
                        json.locations.map(item => <p><span>Media ist in Verwendung:</span> <a target="_blank"
                                                                                               href={`/admin/types/${item.location}?open=${item._id}`}>{item.location}/{item._id}</a>
                        </p>)
                    }
                    {btn}
                </div>
            }else{
                result.component = <div><p>Wurde noch nicht geprüft.</p>{btn}</div>
            }
        }
    })

    Hook.on('TypeCreateEdit', function ({type, props, dataToEdit, meta}) {
        if (type === 'Media') {

            if (dataToEdit && dataToEdit._id) {
                props.actions.unshift({key: 'clearConversions', label: 'Varianten Löschen'})
            }

            fileToUpload = false

            // access data from TypeContainer
            if (!dataToEdit && meta.TypeContainer.state.createEditDialogOption === 'upload') {

                // remove save button
                props.actions.splice(1, 1)

                props.children = <MediaUploader meta={meta} type={type}/>
            } else if (dataToEdit) {

                props.children = <MediaEditorWrapper meta={meta} dataToEdit={dataToEdit}>{props.children}</MediaEditorWrapper>

            }
        }
    })


    Hook.on('TypesContainerRender', function ({type, content}) {
        if (type === 'Media') {


            content.splice(1, 1, <QuickMediaUploader key="quickMediaUploader" settings={this.settings} pageParams={this.pageParams} getData={this.getData.bind(this)}/>)
        }
    })

    Hook.on('TypeCreateEditBeforeSave', function ({type, dataToEdit, formFields}) {
        if (type === 'Media' && fileToUpload) {

            UploadUtil.uploadData({
                dataUrl: fileToUpload,
                data: {_id: dataToEdit._id},
                fileName: dataToEdit.name,
                uploadTo: '/graphql/upload'
            })
            fileToUpload = false
            delete dataToEdit.upload
        }
    })

    // add entry to main menu
    Hook.on('MenuMenu', ({menuItems}) => {
        menuItems.push({key:'Media',name: 'Medias', to: ADMIN_BASE_URL + '/medias', auth: true, icon: <ImageIcon/>})
    })


    const QuickMediaUploader = (props) => {

        const {settings,pageParams,getData} = props

        let info = ''
        const [group, setGroup] = useState(
            settings.Media && settings.Media.group ? settings.Media.group : []
        )


        let groupIds = null

        if (group.length > 0) {
            groupIds = []
            group.forEach((g) => {
                groupIds.push(g._id)
            })

        }

        const media = settings.Media
        let conversion = null
        if (media && media.conversion && media.conversion.length > 0) {
            conversion = JSON.parse(media.conversion[0].conversion)
            info += ' Conversion=' + media.conversion[0].name
        }


        return <Row spacing={1} style={{marginBottom: '16px'}}>
            <Col md={9}>
                <FileDrop key="fileDrop"
                          multi={true}
                          accept="*/*"
                          uploadTo="/graphql/upload"
                          resizeImages={true}
                          imagePreview={false}
                          maxSize={10000}
                          data={{group: groupIds}}
                          conversion={conversion}
                          onSuccess={r => {
                              setTimeout(() => {
                                  getData(pageParams, false)
                              }, 2000)
                          }}/>
            </Col>
            <Col md={3}>

                <TypePicker value={group} onChange={(e) => {
                    setGroup(e.target.value)
                }} multi={true} name="group" placeholder={_t('Media.selectGroup')}
                            type="MediaGroup"/>
                <br/>
                <small>{info}</small>
            </Col>
        </Row>
    }

    const MediaUploader = ({meta, type}) => {

        const mediaSetting = meta.TypeContainer.settings.Media

        const [conversion, setConversion] = useState(
            mediaSetting && mediaSetting.conversion ? mediaSetting.conversion : []
        )

        const [group, setGroup] = useState(
            mediaSetting && mediaSetting.group ? mediaSetting.group : []
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
                        meta.TypeContainer.setSettingsForType(type, {conversion: e.target.value})

                    }} name="conversion" placeholder={_t('Media.selectConversion')}
                                type="MediaConversion"/>

                    <TypePicker value={group} onChange={(e) => {
                        meta.TypeContainer.setSettingsForType(type, {group: e.target.value})
                        setGroup(e.target.value)
                    }} multi={true} name="group" placeholder={_t('Media.selectGroup')}
                                type="MediaGroup"/>
                </div>,
                /*<SimpleSwitch key="useCdn" label="Upload file to CDN" name="useCdn"
                              onChange={(e) => {
                                  setUseCdn(e.target.checked)
                              }} checked={useCdn}/>*/,
                <FileDrop key="fileDrop" multi={true}
                          conversion={conversion && conversion.length > 0 ? JSON.parse(conversion[0].conversion) : null}
                          accept="*/*"
                          uploadTo="/graphql/upload"
                          resizeImages={true}
                          data={{group: groupIds, useCdn}}
                          maxSize={10000}
                          imagePreview={false}
                          onSuccess={r => {
                              if (meta.TypeContainer) {
                                  setTimeout(() => {
                                      meta.TypeContainer.setState({
                                          createEditDialog: false,
                                          createEditDialogOption: null
                                      })

                                      meta.TypeContainer.getData(meta.TypeContainer.pageParams, false)

                                  }, 2000)

                              }
                              // TODO: but it directly into the store instead of reload
                              //const queries = this.getQueries(type), storeKey = this.getStoreKey(type)


                          }}/>]
        )
    }

    const MediaEditorWrapper = ({children, dataToEdit, meta}) => {
        const mediaSetting = meta.TypeContainer ? meta.TypeContainer.settings.Media : {}


        const [conversion, setConversion] = useState(
            mediaSetting && mediaSetting.conversion ? mediaSetting.conversion : []
        )

        const [tabValue, setTabValue] = useState(
            0
        )
        const [overrideFile, setOverrideFile] = useState(
            false
        )
        const mediaData = Util.getImageObject(dataToEdit)


        let editor

        if (dataToEdit.mimeType && dataToEdit.mimeType.indexOf('image') === 0) {


            editor = [<img key="mediaImage"
                           id="mediaImage"
                           style={{border: 'solid 0.4rem black', maxWidth: '100%', maxHeight: '20rem'}}
                           src={mediaData.src}/>,
                <Button color="primary" variant="contained" key="mediaImageEdit" onClick={() => {
                    DomUtil.addScript('https://cdn.scaleflex.it/plugins/filerobot-image-editor/3.7.7/filerobot-image-editor.min.js', {
                        async: true,
                        onload: (e) => {
                            e.preventDefault()
                            const onComplete = function (data) {
                                fileToUpload = data.canvas.toDataURL(dataToEdit.mimeType.substring(6), 0.85)
                                Util.$('#mediaImage').src = fileToUpload
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
                            }, {onBeforeComplete: onComplete})

                            ImageEditor.open(mediaData.src)

                        }
                    })

                }
                }>Bild bearbeiten
                </Button>]


        } else if (dataToEdit.mimeType && dataToEdit.mimeType.indexOf('video') === 0) {
            let src = mediaData.src
            if (dataToEdit.mimeType === 'video/mpeg') {
                src += '?ext=mp4&transcode={"audioQuality":2,"videoBitrate":2000,"fps":15,"size":"320x?","crf":25}'
            }
            editor = <video width="320" height="240" controls>
                <source src={src} type={'video/mp4'}/>
            </video>
        } else if (dataToEdit.mimeType && dataToEdit.mimeType.indexOf('audio') === 0) {

            editor = <audio controls>
                <source src={mediaData.src + '?ext=mp3'} type={dataToEdit.mimeType}/>
            </audio>
        } else {
            editor = <a href={mediaData.src } target="_blank">
                {dataToEdit.name || 'download'}
            </a>
        }
        return [<Box sx={{ flexGrow: 1, bgcolor: 'background.paper', display: 'flex' }}>
                <SimpleTabs
                    style={{minWidth:'10rem'}}
                    orientation="vertical"
                    value={tabValue}
                    onChange={(e, newValue) => {
                        setTabValue(newValue)
                    }}>
                    <SimpleTab key="tab0" label="Einstellungen"/>
                    <SimpleTab key="tab1" label="Voransicht"/>
                    <SimpleTab key="tab2" label="Upload"/>
                </SimpleTabs>
                <SimpleTabPanel style={{flexGrow:1,marginTop:'-24px',maxWidth: 'calc(100% - 10rem)'}} key="tabPanel0" value={tabValue} index={0}>
                    <Paper elevation={1}>
                        {children}
                    </Paper>
                </SimpleTabPanel>
                <SimpleTabPanel style={{flexGrow:1}} key="tabPanel1" value={tabValue} index={1}>
                    {editor}
                </SimpleTabPanel>
                <SimpleTabPanel style={{flexGrow:1}} key="tabPanel2" value={tabValue} index={2}>
                    <p>Sie können hier das bestehende Media durch einen Upload ersetzen. Alle Elemente die das Media referenzieren werden ersetzt.</p>


                    <SimpleSwitch key="overrideFile" label={_t('Media.overrideExistingMedia')} name="overrideFile"
                                  onChange={(e) => {
                                      setOverrideFile(e.target.checked)
                                  }} checked={overrideFile}/><br /><br />

                    {overrideFile &&  <TypePicker value={conversion} fullWidth={true} onChange={(e) => {
                        setConversion(e.target.value)

                    }} name="conversion" placeholder={_t('Media.selectConversion')}
                                                  type="MediaConversion"/>}
                    {overrideFile && <FileDrop key="fileDrop" multi={true}
                              conversion={conversion && conversion.length > 0 ? JSON.parse(conversion[0].conversion) : null}
                              accept="*/*"
                              disabled={true}
                              uploadTo="/graphql/upload"
                              resizeImages={true}
                              data={{_id: dataToEdit._id, name: dataToEdit.name}}
                              maxSize={10000}
                              imagePreview={false}
                              onSuccess={r => {
                                  if (meta.TypeContainer) {
                                      setTimeout(() => {
                                          meta.TypeContainer.setState({
                                              createEditDialog: false,
                                              createEditDialogOption: null
                                          })

                                          meta.TypeContainer.getData(meta, false)
                                      }, 0)

                                  }
                              }}/>}
                </SimpleTabPanel>
            </Box>]


    }
}
