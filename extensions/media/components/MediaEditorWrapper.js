import React, {useState, useEffect, useMemo} from 'react'
import Util from '../../../client/util/index.mjs'
import DomUtil from '../../../client/util/dom.mjs'
import {_t} from '../../../util/i18n.mjs'
import {
    Button,
    SimpleTab,
    SimpleTabPanel,
    SimpleTabs,
    Box
} from 'ui/admin'
import Async from '../../../client/components/Async.js'
import UploadUtil from "../../../client/util/upload";
import {getMediaPlaybackSrc, isExternalMedia} from '../../../client/util/media'
import {rememberMediaReplaceHint, showPendingMediaReplaceHint} from './mediaReplaceHint'

const SimpleSwitch = (props) => <Async {...props} expose="SimpleSwitch" load={() =>import(/* webpackChunkName: "admin" */ '../../../gensrc/ui/admin')}/>
const TypePicker = (props) => <Async {...props} load={() =>import(/* webpackChunkName: "admin" */ '../../../client/components/TypePicker')}/>
const FileDrop = (props) => <Async {...props} load={() =>import(/* webpackChunkName: "admin" */ '../../../client/components/FileDrop')}/>

export const MediaEditorWrapper = ({children, dataToEdit, meta}) => {
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

    // placeholders like ${name} resolved, media server through the proxy (only evaluated when the source changes)
    const previewSrc = useMemo(
        () => getMediaPlaybackSrc(dataToEdit),
        [dataToEdit.src, dataToEdit.name, dataToEdit._id]
    )
    // external sources: no transcoding parameters
    const isMediaHostSrc = isExternalMedia(dataToEdit)

    const [previewError, setPreviewError] = useState(false)
    useEffect(() => {
        setPreviewError(false)
    }, [previewSrc])

    let editor

    if (dataToEdit.mimeType && dataToEdit.mimeType.indexOf('image') === 0) {

        editor = <><img key="mediaImage"
                        id="mediaImage"
                        style={{border: 'solid 0.4rem black', maxWidth: '100%', maxHeight: '20rem'}}
                        src={previewSrc}/><br />
            <div id="image-editor" style={{position:'absolute',top:0, right:0, left:0, bottom:0,zIndex:10,display:'none'}}></div>
            <Button color="primary" variant="contained" key="mediaImageEdit" onClick={() => {
                DomUtil.createAndAddTag('style', 'head', {
                    textContent: '.SfxModal-Wrapper{z-index:10000 !important}.SfxPopper-wrapper{z-index:10100 !important}',
                    id:'FilerobotImageEditor'
                })
                DomUtil.addScript('https://scaleflex.cloudimg.io/v7/plugins/filerobot-image-editor/latest/filerobot-image-editor.min.js', {
                    async: true,
                    onload: (e) => {
                        e.preventDefault()
                        //after importing the plugin/library from CDN
                        const container = document.getElementById("image-editor")
                        container.style.display = 'block'

                        const config = {
                            source: mediaData.src,
                            showBackButton:true,
                            closeAfterSave:true,
                            annotationsCommon:{
                                zIndex:9999
                            },
                            onBeforeSave:(e)=>{
                                return true
                            },
                            moreSaveOptions:[
                                {
                                    label: 'Current file',
                                    onClick: (triggerSaveModal, triggerSave) =>
                                        triggerSaveModal((imageInfo, designState) => {
                                            console.log(imageInfo, designState)
                                            UploadUtil.uploadData({
                                                dataUrl:imageInfo.imageBase64,
                                                uploadTo: '/graphql/upload',
                                                data:{_id: dataToEdit._id, name: dataToEdit.name},
                                                onLoad: (e) => {
                                                    if(e.target.response) {
                                                        const {status, message} = e.target.response
                                                        if (status === 'success') {
                                                            document.getElementById('mediaImage').src= imageInfo.imageBase64
                                                        } else {
                                                            _app_.dispatcher.addNotification(message)
                                                        }
                                                    }else{
                                                    }
                                                },
                                                onError: (e) => {
                                                    _app_.dispatcher.addNotification(e.message)
                                                }
                                            })
                                        })
                                },
                                {
                                    label: 'Save as new file (Export)',
                                    onClick: (triggerSaveModal, triggerSave) =>
                                        triggerSave((imageInfo, designState) => {
                                            const tmpLink = document.createElement('a')
                                            tmpLink.download = imageInfo.fullName
                                            tmpLink.href = imageInfo.imageBase64
                                            tmpLink.style = 'position: absolute; z-index: -111; visibility: none;'
                                            document.body.appendChild(tmpLink)
                                            tmpLink.click()
                                            document.body.removeChild(tmpLink)
                                        })
                                },
                            ],
                            onSave: (imageInfo, designState) => {
                                console.log('save',imageInfo, designState)
                            },
                            onClose: (closingReason) => {
                                container.style.display = 'none'
                                console.log('Closing reason', closingReason);
                                ImageEditor.terminate();
                            }
                        }
                        const ImageEditor = new FilerobotImageEditor(container, config)

                        ImageEditor.render({
                            // additional config provided while rendering
                            observePluginContainerSize: true
                        })
                    }
                })
            }
            }>{_t('Media.editImage')}</Button>
            <p>{dataToEdit.imageScene || ''}</p>
            <p><small>Keywords: <strong>{dataToEdit.imageKeyword || ''}</strong></small></p></>

    } else if (dataToEdit.mimeType && dataToEdit.mimeType.indexOf('video') === 0) {
        let src = previewSrc
        if (!isMediaHostSrc && dataToEdit.mimeType === 'video/mpeg') {
            src += '?ext=mp4&transcode={"audioQuality":2,"videoBitrate":2000,"fps":15,"size":"320x?","crf":25}'
        }
        editor = <>
            <video key={src}
                   controls
                   preload="metadata"
                   playsInline
                   onError={() => setPreviewError(true)}
                   style={{width: '100%', maxWidth: '60rem', maxHeight: 'calc(100vh - 24rem)', background: '#000'}}>
                <source src={src} type={isMediaHostSrc ? undefined : 'video/mp4'}/>
            </video>
            {previewError && <p style={{color: 'crimson'}}>Vorschau konnte nicht geladen werden. Source: <code>{previewSrc}</code></p>}
        </>
    } else if (dataToEdit.mimeType && dataToEdit.mimeType.indexOf('audio') === 0) {

        editor = <audio key={previewSrc} controls preload="metadata" style={{width: '100%', maxWidth: '30rem'}}>
            <source src={isMediaHostSrc ? previewSrc : previewSrc + '?ext=mp3'} type={dataToEdit.mimeType}/>
        </audio>
    } else {
        editor = <a href={previewSrc} target="_blank">
            {dataToEdit.name || 'download'}
        </a>
    }
    return [<Box sx={{ minHeight:'min(72vh, calc(100vh - 22rem))',bgcolor: 'background.paper', display: 'flex' }}>
        <SimpleTabs
            style={{minWidth:'10rem'}}
            orientation="vertical"
            value={tabValue}
            onChange={(e, newValue) => {
                setTabValue(newValue)
            }}>
            <SimpleTab key="tab0" label="Einstellungen"/>
            <SimpleTab key="tab1" label={_t('Media.mediaPreview')} onClick={() => {}}/>
            <SimpleTab key="tab2" label="Upload"/>
        </SimpleTabs>
        <SimpleTabPanel style={{flexGrow:1,marginTop:'-24px',maxWidth: 'calc(100% - 10rem)'}} contentSx={{mt: 3, ml: 3}} key="tabPanel0" value={tabValue} index={0}>
            {children}
        </SimpleTabPanel>
        <SimpleTabPanel style={{flexGrow:1}} contentSx={{mt: 3, ml: 3}} key="tabPanel1" value={tabValue} index={1}>
            {editor}
        </SimpleTabPanel>
        <SimpleTabPanel style={{flexGrow:1}} contentSx={{mt: 3, ml: 3}} key="tabPanel2" value={tabValue} index={2}>
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
                                           // the browser may still show its cached copy of the old file:
                                           // hint for the editor, kept over the reload (see mediaReplaceHint.js)
                                           rememberMediaReplaceHint(dataToEdit._id).then(() => {
                                               if (meta.TypeContainer) {
                                                   /*meta.TypeContainer.setState({
                                                       createEditDialog: false,
                                                       createEditDialogOption: null
                                                   })

                                                   meta.TypeContainer.getData(meta, false)*/

                                                   location.reload()
                                               } else {
                                                   // no reload here - show the hint right away
                                                   showPendingMediaReplaceHint()
                                               }
                                           })
                                       }}/>}
        </SimpleTabPanel>
    </Box>]


}