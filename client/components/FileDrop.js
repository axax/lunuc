import React from 'react'
import PropTypes from 'prop-types'
import {Button, TextField, withStyles, FileUploadIcon, Typography, LinearProgress} from 'ui/admin'
import classNames from 'classnames'
import UploadUtil from 'client/util/upload'

/* TODO: make it configurable */
const MAX_FILE_SIZE_MB = 10,
    IMAGE_QUALITY = 0.6,
    IMAGE_MAX_WIDTH = 1000,
    IMAGE_MAX_HEIGHT = 1000,
    DEFAULT_ACCEPT = 'image/*'

const styles = theme => ({
    uploader: {
        boxSizing: 'border-box',
        position: 'relative',
        maxWidth: '100%',
        padding: '2rem 1.5rem',
        textAlign: 'center',
        background: '#fff',
        borderRadius: '7px',
        border: '3px solid #eee',
        transition: 'all .2s ease',
        '&:hover': {
            borderColor: theme.palette.secondary.light
        }

    },
    uploaderOver: {
        border: '3px solid ' + theme.palette.primary.light,
        boxShadow: 'inset 0 0 0 6px #eee'
    },
    uploadIcon: {
        height: '60px',
        width: '60px',
        transition: 'all .2s ease-in-out'
    },
    uploadIconOver: {
        transform: 'scale(0.8)',
        opacity: 0.3
    },
    image: {
        maxWidth: '100%',
        display: 'block',
        margin: '0 auto 0.5rem auto',
        pointerEvents: 'none'
    },
    progress: {
        position: 'absolute',
        bottom: -1,
        left: -1,
        right: -1,
        borderRadius: '7px',
    },
    inputFile: {
        position: 'absolute',
        height: '100%',
        width: '100%',
        top: 0,
        bottom: 0,
        right: 0,
        left: 0,
        opacity: 0,
        zIndex: 2
    }

})


class FileDrop extends React.Component {
    constructor(props) {
        super(props)

        this.state = this.initialState()
    }

    initialState() {
        return {
            isHover: false,
            images: [],
            uploadCompleted: 0,
            uploading: false,
            errorMessage: null,
            successMessage: null
        }
    }

    reset() {
        this.setState(this.initialState())
    }

    render() {
        const {style, classes, multi, label, accept} = this.props
        const {isHover, images, uploading, uploadCompleted, errorMessage, successMessage} = this.state

        return <div style={style} className={classNames(classes.uploader, isHover && classes.uploaderOver)}>
            <input className={classes.inputFile}
                   multiple={!!multi}
                   type="file"
                   name="fileUpload"
                   accept={accept || DEFAULT_ACCEPT}
                   onDragLeave={this.handelDragLeave.bind(this)}
                   onDragOver={this.handelDragOver.bind(this)}
                   onChange={this.handelDrop.bind(this)}/>
            {
                images.map(i => {
                    return <img className={classes.image} key={i} src={i}/>
                })
            }


            { !uploading &&
            <FileUploadIcon className={classNames(classes.uploadIcon, isHover && classes.uploadIconOver)}
                            color="disabled"/> }

            { !uploading &&
            <Typography
                variant="caption">{label || 'Drop files here, or click to select files to upload.'}</Typography> }

            { errorMessage && <Typography variant="body2" color="error">{errorMessage}</Typography> }
            { successMessage && <Typography variant="body2" color="primary">{successMessage}</Typography> }

            { uploading && <Typography variant="body2">uploading data...</Typography> }
            { uploading && <LinearProgress className={classes.progress} mode="determinate" value={uploadCompleted}/> }

        </div>
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
        const {onFileContent, onFiles, accept, uploadTo, resizeImages} = this.props
        this.setDragState(e, false)

        // Fetch FileList object
        const files = e.target.files || e.dataTransfer.files

        const {validFiles, invalidFiles} = UploadUtil.validateFiles({
            files,
            accept: (accept || DEFAULT_ACCEPT),
            maxFileSize: MAX_FILE_SIZE_MB * 1024 * 1024
        })

        if (invalidFiles.length) {
            // TODO show message of all files
            this.setState({errorMessage: invalidFiles[0].message})
        } else {

            const images = []

            for (let i = 0, file; file = validFiles[i]; i++) {
                const isImage = UploadUtil.isImage(file.name)

                if( isImage ) {
                    images.push(URL.createObjectURL(file))
                }

                if (uploadTo) {
                    if (resizeImages && isImage) {
                        UploadUtil.resizeImageFromFile({
                            file,
                            maxWidth: IMAGE_MAX_WIDTH,
                            maxHeight: IMAGE_MAX_HEIGHT,
                            quality: IMAGE_QUALITY,
                            onSuccess: (dataUrl) => {
                                this.uploadData(dataUrl, file, uploadTo)
                            }
                        })
                    } else {
                        this.uploadData(URL.createObjectURL(file), file, uploadTo)
                    }
                }

                if (onFileContent) {
                    const reader = new FileReader()
                    reader.readAsText(file, 'UTF-8')
                    reader.onload = function (e) {
                        onFileContent(file, e.target.result)
                    }
                }

            }


            if (onFiles) {
                onFiles(validFiles)
            }
            this.setState({images})
        }
    }

    updateFileProgress(e) {
        this.setState({uploadCompleted: Math.ceil(e.loaded * 100 / e.total)})
    }

    uploadData(dataUrl, file, uploadTo) {
        this.setState({uploading: true, successMessage: null, errorMessage: null, uploadCompleted: 0})
        UploadUtil.uploadData({
            dataUrl,
            fileName: file.name,
            uploadTo,
            onProgress: this.updateFileProgress.bind(this),
            onLoad: (e) => {
                const {status, message} = e.target.response
                if (status === 'success') {
                    this.setState({successMessage: 'upload was successfull', uploading: false})

                    const {onSuccess} = this.props
                    if (onSuccess) {
                        onSuccess(e.target.response, this)
                    }

                } else {
                    this.setState({errorMessage: message, uploading: false})
                }
            },
            onError: (e) => {
                this.setState({errorMessage: e.message, uploading: false})
            }
        })
    }

}

FileDrop.propTypes = {
    classes: PropTypes.object.isRequired,
    onSuccess: PropTypes.func,
    label: PropTypes.string,
    accept: PropTypes.string,
    onFileContent: PropTypes.func,
    onFiles: PropTypes.func,
    uploadTo: PropTypes.string,
    style: PropTypes.object,
    resizeImages: PropTypes.bool,
    multi: PropTypes.bool
}

export default withStyles(styles)(FileDrop)