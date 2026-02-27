import React from 'react'
import PropTypes from 'prop-types'
import {CloudUploadIcon, Typography, LinearProgress} from 'ui/admin'
import UploadUtil from 'client/util/upload'
import {_t, registerTrs} from 'util/i18n.mjs'
import config from 'gen/config-client'
import styled from '@emotion/styled'
import DomUtil from '../util/dom.mjs'
import defaultTheme from './ui/impl/material/theme-iris'

const {UPLOAD_URL} = config


//expose
_app_.UploadUtil = UploadUtil

const DEFAULT_MAX_FILE_SIZE_MB = 20,
    IMAGE_QUALITY = 0.9,
    IMAGE_MAX_WIDTH = 2400,
    IMAGE_MAX_HEIGHT = 2400,
    DEFAULT_ACCEPT = 'image/*'


const StyledUploader = styled('div')(({isHover, theme}) => ({
    boxSizing: 'border-box',
    position: 'relative',
    maxWidth: '100%',
    padding: '1rem 1rem',
    textAlign: 'center',
    background: '#fff',
    borderRadius: '7px',
    border: '3px solid #eee',
    transition: 'all .2s ease',
    ...(isHover && {
        border: '3px solid ' + theme.palette ? theme.palette.primary.light : defaultTheme.palette.primary.light,
        boxShadow: 'inset 0 0 0 6px #eee'
    }),
    '&:hover': {
        borderColor: theme.palette ? theme.palette.secondary.light : defaultTheme.palette.secondary.light,
    },
    '> input': {
        position: 'absolute',
        height: '100% !important',
        width: '100% !important',
        top: 0,
        bottom: 0,
        right: 0,
        left: 0,
        opacity: 0,
        zIndex: 2
    }
}))


const StyledUploadedImage = styled('div')({
    position: 'relative',
    '> img': {
        maxWidth: '100%',
        display: 'block',
        margin: '0 auto 0.5rem auto',
        pointerEvents: 'none'
    },
    '> button': {
        position: 'absolute',
        top: '-0.5rem',
        right: '-0.5rem',
        borderRadius: '50%',
        height: '1.5rem',
        width: '1.5rem',
        color: 'red',
        backgroundColor: '#fff',
        border:'solid 1px #e1e1e1',
        padding: 0,
        fontSize: '1rem',
        textAlign: 'center',
        cursor: 'pointer',
        zIndex:3,
        '&:hover': {
            fontWeight:'bold'
        }
    }
})

const StyledUploadIcon = styled(CloudUploadIcon)(({isHover}) => ({
    height: '60px',
    width: '60px',
    transition: 'all .2s ease-in-out',
    ...(isHover && {
        transform: 'scale(0.8)',
        opacity: 0.3
    }),
}))

const StyledLinearProgress = styled(LinearProgress)({
    position: 'absolute',
    bottom: -1,
    left: -1,
    right: -1,
    borderRadius: '7px'
})


class FileDrop extends React.Component {
    constructor(props) {
        super(props)

        registerTrs({
            de:{
                'FileDrop.dropArea': 'Ziehen Sie Dateien hierhin oder klicken Sie hier und wählen Sie Dateien zum Hochladen aus.',
                'FileDrop.uploadSuccess': 'Dateiupload war erfolgreich',
            },
            en:{
                'FileDrop.dropArea': 'Drop files here, or click to select files to upload.',
                'FileDrop.uploadSuccess': 'upload was successfull',
            }
        }, 'FileDrop')

        this.state = FileDrop.initialState(props)
    }

    static initialState(props) {
        const images = []
        if (props.value) {
            let value
            try{
                value = JSON.parse(props.value)
            }catch (e) {
                value = props.value
            }
            if( value.constructor === Object){
                if( value._id ){
                    images.push(UPLOAD_URL+'/'+value._id.toString())
                }else if(value.fileIds && value.fileIds.length>0){
                    images.push(UPLOAD_URL+'/'+value.fileIds[0])
                }
            }else {
                images.push(value)
            }
        }
        return {
            uploadQueue: [],
            isHover: false,
            images,
            uploadCompleted: 0,
            uploading: false,
            errorMessage: null,
            successMessage: null,
            conversionOri: props.conversion,
            conversion: props.conversion || [{qualitiy: IMAGE_QUALITY, maxWidth: IMAGE_MAX_WIDTH}],
            zipFiles: null
        }
    }


    static getDerivedStateFromProps(nextProps, prevState) {
        if (JSON.stringify(nextProps.conversion) !== JSON.stringify(prevState.conversionOri)) {
            return FileDrop.initialState(nextProps)
        }
        return null
    }


    reset() {
        this.setState(this.initialState(this.props))
    }

    render() {
        const {style, multi, label, accept, className, name, onChange, imagePreview, deleteButton} = this.props
        const {isHover, images, uploading, uploadCompleted, errorMessage, successMessage, uploadingFile, uploadQueue, zipFiles} = this.state
        return <StyledUploader isHover={isHover} style={style} className={className}>
            <input multiple={!!multi}
                   type="file"
                   name={name || 'fileUpload'}
                   accept={accept || DEFAULT_ACCEPT}
                   onDragLeave={this.handelDragLeave.bind(this)}
                   onDragOver={this.handelDragOver.bind(this)}
                   onChange={this.handelDrop.bind(this)}/>
            {
                (imagePreview===undefined || imagePreview) && images.map(i => {
                    return <StyledUploadedImage key={'uploadImage'+i}>
                        <img src={i}/>
                        {deleteButton !== false ? <button onClick={
                            (e)=>{
                                this.setState({images:[]})
                                if( onChange ) {
                                    onChange({target: {name, value: ''}})
                                }
                            }
                        }>×</button>:null}
                    </StyledUploadedImage>
                })
            }

            <div data-drop-text>
                <StyledUploadIcon isHover={isHover} color="disabled"/>

                <Typography component="div"
                            variant="caption">{label || _t('FileDrop.dropArea')}</Typography>
            </div>
            {errorMessage && <Typography variant="body2" color="error">{errorMessage}</Typography>}
            {successMessage && <Typography variant="body2" color="primary">{successMessage}</Typography>}

            {uploading && <Typography variant="body2">uploading {uploadingFile} ({uploadCompleted}%{uploadQueue.length>0?' / '+uploadQueue.length+' in queue':''})...</Typography>}
            {uploading && <StyledLinearProgress variant="determinate" value={uploadCompleted}/>}

            {zipFiles ? <ul style={{textAlign:'left'}}>{Object.keys(zipFiles.files).map((filename) => <li>${filename}</li>)}</ul> : null}

        </StyledUploader>
    }

    setDragState(e, isHover) {
        e.preventDefault()
        e.stopPropagation()
        this.setState({isHover})
    }

    handelDragOver(e) {
        this.setDragState(e, true)
    }

    handelDragLeave(e) {
        this.setDragState(e, false)
    }

    handelDrop(e) {
        const {onFileContent, onDataUrl, onFiles, onChange, onZipExtraction, name, accept, uploadTo, resizeImages, maxSize} = this.props
        const {conversion} = this.state
        this.setDragState(e, false)

        // Fetch FileList object
        const files = e.target.files || e.dataTransfer.files

        const {validFiles, invalidFiles} = UploadUtil.validateFiles({
            files,
            accept: (accept || DEFAULT_ACCEPT),
            maxFileSize: (maxSize || DEFAULT_MAX_FILE_SIZE_MB) * 1024 * 1024
        })

        if (invalidFiles.length) {
            // TODO show message of all files
            this.setState({errorMessage: invalidFiles[0].message})
        } else {
            // reset error message
            this.setState({errorMessage: null, successMessage:null})

            const images = []

            for (let i = 0, file; file = validFiles[i]; i++) {
                const isImage = UploadUtil.isImage(file.name)
                if (isImage) {
                    images.push(URL.createObjectURL(file))
                }
                if (resizeImages && isImage) {
                    UploadUtil.resizeImageFromFile({
                        file,
                        conversion,
                        onSuccess: (dataUrl) => {
                            if (uploadTo) {
                                this.uploadData(dataUrl, file, uploadTo)
                            }else if (onChange) {

                                // call with target
                                onChange({target: {name, value: dataUrl}})
                            }
                        }
                    })
                } else if (uploadTo) {
                    this.uploadData(URL.createObjectURL(file), file, uploadTo)
                }

                if (onFileContent) {
                    const reader = new FileReader()
                    reader.readAsText(file, 'UTF-8')
                    reader.onload = function (e) {
                        onFileContent(file, e.target.result)
                    }
                }

                if (onDataUrl) {
                    const reader = new FileReader()
                    reader.readAsDataURL(file)
                    reader.onload = function (e) {
                        onDataUrl(file, e.target.result)
                    }
                }

                if(onZipExtraction){
                    DomUtil.addScript('/jszip/jszip.min.js', {
                        id: 'jszip',
                        onload: () => {

                            const reader = new FileReader()
                            reader.onload = (e) => {
                                JSZip.loadAsync(e.target.result).then((zipFiles)=> {
                                    this.setState({zipFiles})
                                    onZipExtraction(zipFiles)
                                })
                            }
                            reader.readAsArrayBuffer(file)

                        }
                    },{ignoreIfExist:true})
                }

            }


            if (onFiles) {
                onFiles(validFiles, images)
            }
            this.setState({images})
        }
    }

    updateFileProgress(e) {
        this.setState({uploadCompleted: Math.ceil(e.loaded * 100 / e.total)})
    }

    uploadData(dataUrl, file, uploadTo, fromQueue) {

        const uploadQueue = this.state.uploadQueue

        if( !fromQueue && this.uploading) {
            uploadQueue.push({dataUrl, file, uploadTo})
            return
        }
        // uploading from state is delayed
        this.uploading = true
        this.setState({uploadQueue, uploading: true, successMessage: null, errorMessage: null, uploadCompleted: 0, uploadingFile:file.name})
        UploadUtil.uploadData({
            dataUrl,
            data: this.props.data,
            fileName: file.name,
            uploadTo,
            onProgress: this.updateFileProgress.bind(this),
            onLoad: (e) => {
                if(e.target.response) {
                    const {status, message} = e.target.response
                    if (status === 'success') {

                        const {onSuccess, onChange, name} = this.props
                        if (onSuccess) {
                            onSuccess(e.target.response, this)
                        }

                        if (onChange) {
                            // call with target
                            onChange({target: {name, value: e.target.response}})
                        }

                        if( uploadQueue.length > 0){
                            const fromQueue = uploadQueue.shift()
                            this.uploadData(fromQueue.dataUrl, fromQueue.file, fromQueue.uploadTo, true)
                            return
                        }
                        this.uploading = false
                        this.setState({uploadQueue, successMessage: _t('FileDrop.uploadSuccess'), uploading: false})

                    } else {
                        this.uploading = false
                        this.setState({errorMessage: message, uploading: false})
                    }
                }else{
                    this.uploading = false
                    this.setState({errorMessage: e.target.statusText, uploading: false})
                }
            },
            onError: (e) => {
                this.uploading = false
                this.setState({errorMessage: e.message, uploading: false})
            }
        })
    }

}

FileDrop.propTypes = {
    onSuccess: PropTypes.func,
    label: PropTypes.string,
    accept: PropTypes.string,
    onFileContent: PropTypes.func,
    onDataUrl: PropTypes.func,
    onFiles: PropTypes.func,
    onChange: PropTypes.func,
    uploadTo: PropTypes.string,
    name: PropTypes.string,
    value: PropTypes.string,
    className: PropTypes.string,
    style: PropTypes.object,
    data: PropTypes.object,
    resizeImages: PropTypes.bool,
    imagePreview: PropTypes.bool,
    multi: PropTypes.bool,
    conversion: PropTypes.array,
    maxSize: PropTypes.number
}

export default FileDrop
