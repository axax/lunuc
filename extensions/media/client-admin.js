import React from 'react'
import Hook from 'util/hook.cjs'
import Async from 'client/components/Async'
import config from 'gen/config-client'
import Util from '../../client/util/index.mjs'
import {Button, Tooltip, AutoAwesomeIcon, OpenInNewIcon} from 'ui/admin'
const {UPLOAD_URL, ADMIN_BASE_URL, PRETTYURL_SEPERATOR} = config
import {_t, registerTrs} from 'util/i18n.mjs'
import UploadUtil from '../../client/util/upload'
import {client} from 'client/middleware/graphql'
import {translations} from './translations/translations'
import {CAPABILITY_MANAGE_OTHER_USERS, CAPABILITY_ADMIN_OPTIONS} from '../../util/capabilities.mjs'
import {formatBytes} from '../../client/util/format.mjs'
import {MediaEditorWrapper} from './components/MediaEditorWrapper.js'
import {MediaUploader} from './components/MediaUploader'
import {QuickMediaUploader} from './components/QuickMediaUploader'

const ImageIcon = (props) => <Async {...props} expose="ImageIcon" load={import(/* webpackChunkName: "admin" */ '../../gensrc/ui/admin')}/>

registerTrs(translations, 'MediaTranslations')

const downloadLink = (url,name) => {
    const a = document.createElement('a')
    a.setAttribute('href', url)
    a.setAttribute('download', name)
    a.setAttribute('target', '_blank')
    a.click()
}

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
                    const mimeType = item.mimeType ? item.mimeType.split('/') : ['file']

                    let image = (mimeType[0] === 'image' ?
                                    <img style={{display:'block',maxWidth: '6rem', maxHeight: '6rem', objectFit: 'cover', borderRadius: '0.25rem' }}
                                         src={item.src || `${UPLOAD_URL}/${item._id}/${PRETTYURL_SEPERATOR}/${item.name}${item.mimeType.indexOf('svg')<0?'?format=webp&quality=50&width=96&remoteserver=false':'?remoteserver=false'}`}/>
                                    :
                                    <div className="file-icon"
                                         data-type={mimeType.length > 1 ? mimeType[1] : 'doc'}></div>
                            )
                    if(item.imageKeyword || item.imageScene){
                        image = <Tooltip title={<>
                            <p>{item.imageScene || ''}</p>
                            <p><small>Keywords: <strong>{item.imageKeyword || ''}</strong></small></p>
                        </>} placement="top" style={{display:'block',position:'relative'}}>
                            {image}
                            <AutoAwesomeIcon style={{padding:'1px',background:'rgba(0,0,0,0.8)',borderRadius:'50%',
                                width:'18px',height:'18px',position:'absolute',
                                left:'-8px',top:'-5px',color:'#fff',opacity:1}} icon="image"/>
                        </Tooltip>
                    }


                    if (window.opener) {
                        d.data = image
                    } else {

                        let uploadUrl = `${UPLOAD_URL}/${item._id}/${PRETTYURL_SEPERATOR}/${item.name}`

                        if(mimeType.length > 1 && uploadUrl.indexOf('.')<0){
                            uploadUrl += `.${mimeType[1]}`
                        }

                        d.data =
                            <a target="_blank" onDoubleClick={(e) => {
                                e.preventDefault()
                            }} rel="noopener noreferrer"
                               href={item.src || uploadUrl}>
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

            multiSelectActions.unshift({name: 'Download', value: 'download', icon:'download'})
            multiSelectActions.unshift({name: _t('TypesContainer.downloadAsZip'), value: 'downloadZip', icon:'folderZip'})


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


    const createDataUrlFromUrl = async (url, mimeType = null) => {
        try {
            const response = await fetch(url)


            // If mimeType is 'image/svg+xml', return the raw SVG text instead of base64
            if (mimeType === 'image/svg+xml') {
                const text = await response.text()
                return `data:${mimeType};utf8,${encodeURIComponent(text)}`
            }


            const blob = await response.blob()
            const reader = new FileReader()
            return new Promise((resolve, reject) => {
                reader.onloadend = () => {
                    if (mimeType) {
                        // Replace the MIME type in the data URL
                        const dataUrl = reader.result
                        const newUrl = dataUrl.replace(/^data:[^;]+/, `data:${mimeType}`)
                        resolve(newUrl)
                    } else {
                        resolve(reader.result)
                    }
                };
                reader.onerror = reject
                reader.readAsDataURL(blob)
            })
        } catch (error) {
            throw new Error(`Failed to create data URL from URL: ${error.message}`)
        }
    }

    // add an entry actions
    Hook.on('TypeTableEntryAction', ({type, actions, item, container}) => {
        if (type === 'Media') {
            actions.push({
                divider:true,
                name: _t('Media.toDataUrl'),
                onClick: async () => {
                    const dataUrl = await createDataUrlFromUrl(item.src || `${UPLOAD_URL}/${item._id}/${PRETTYURL_SEPERATOR}/${item.name}`, item.mimeType)
                    console.log(dataUrl)

                    container.setState({simpleDialog: {
                            title:_t('Media.toDataUrl'),
                            maxWidth:'lg',
                            fullWidth:true,
                            children:<textarea style={{
                                width: '100%',
                                height: '50vh'
                            }}>{dataUrl}</textarea>,
                            action:'ignore', open:true}})

                },
                icon: <OpenInNewIcon/>
            })
        }
    })

    Hook.on('TypeTableMultiSelectAction', function ({action, data, selectedRows, meta}) {
        if(action === 'downloadZip'){
            client.query({
                query: `query getTokenLink($mediaIds:[ID]){getTokenLink(mediaIds:$mediaIds){token}}`,
                variables: {
                    mediaIds: Object.keys(selectedRows)
                }}).then(response => {
                    console.log(response)
                if (response.data && response.data.getTokenLink) {
                    downloadLink(`${location.origin}/tokenlink/${response.data.getTokenLink.token}/-/medias.zip`,'medias.zip')
                }
            }).catch((error)=>{})
        }else if(action === 'download'){
            Object.keys(selectedRows).forEach(id=>{
                const item = data.results.find(f=>f._id===id)
                if(item) {
                    downloadLink(`${UPLOAD_URL}/${item._id}`,item.name)
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
                props.actions.unshift({key: 'clearConversions', label: _t('Media.clearVariants')})
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


}
