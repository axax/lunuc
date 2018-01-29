import React from 'react'
import PropTypes from 'prop-types'
import {Button, TextField, withStyles, FileUploadIcon, Typography, LinearProgress} from 'ui/admin'
import classNames from 'classnames'


const UPLOAD_URL = '/graphql/upload'
const MAX_FILE_SIZE_MB = 10

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
        userSelect: 'none',
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
        margin: '0 auto 0.5rem auto'
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
        opacity: 0
    }

})
/*.uploader {


 label {
 float: left;
 clear: both;
 width: 100%;
 padding: 2rem 1.5rem;
 text-align: center;
 background: #fff;
 border-radius: 7px;
 border: 3px solid #eee;
 transition: all .2s ease;
 user-select: none;

 &:hover {
 border-color: $theme;
 }
 &.hover {
 border: 3px solid $theme;
 box-shadow: inset 0 0 0 6px #eee;

 #start {
 i.fa {
 transform: scale(0.8);
 opacity: 0.3;
 }
 }
 }
 }*/


class FileDrop extends React.Component {
    constructor(props) {
        super(props)

        this.state = {
            isHover: false,
            images: [],
            uploadCompleted: 0,
            uploading: false,
            errorMessage: null,
            successMessage: null
        }
    }

    render() {
        const {classes} = this.props
        const {isHover, images, uploading, uploadCompleted, errorMessage, successMessage} = this.state

        return <div className={classNames(classes.uploader, isHover && classes.uploaderOver)}>
            <input className={classes.inputFile}
                   type="file"
                   name="fileUpload"
                   accept="image/*"
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
            <Typography type="caption">Drop files here, or click to select files to upload.</Typography> }

            { errorMessage && <Typography type="caption" color="error">{errorMessage}</Typography> }
            { successMessage && <Typography type="caption" color="secondary">{successMessage}</Typography> }

            { uploading && <Typography type="caption">uploading data...</Typography> }
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
        this.setDragState(e, false)

        // Fetch FileList object
        const files = e.target.files || e.dataTransfer.files;

        // Process all File objects
        const images = []
        for (let i = 0, f; f = files[i]; i++) {
            var isImage = (/\.(?=gif|jpg|png|jpeg)/gi).test(f.name)
            if (isImage) {

                images.push(URL.createObjectURL(f))
                //preview(f);
                this.resizeImageAndUpload(f)
            }
        }
        this.setState({images})
    }

    updateFileProgress(e) {
        this.setState({uploadCompleted: Math.ceil(e.loaded * 100 / e.total)})
    }


    resizeImageAndUpload(file) {

        const oriImg = new Image()
        oriImg.onload = () => {


            const MAX_WIDTH = 2800
            const MAX_HEIGHT = 2600
            let width = oriImg.width, height = oriImg.height

            if (width > height) {
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width
                    width = MAX_WIDTH
                }
            } else {
                if (height > MAX_HEIGHT) {
                    width *= MAX_HEIGHT / height
                    height = MAX_HEIGHT
                }
            }


            const canvas = document.createElement('canvas')
            canvas.width = width
            canvas.height = height

            const ctx = canvas.getContext("2d")
            ctx.drawImage(oriImg, 0, 0, width, height)

            //Some update on canvas
            ctx.font = "30px serif"
            ctx.fillStyle = "rgba(0, 0, 0, 0.4)"
            ctx.fillText(file.name, 5, height - 8)


            const dataUrl = canvas.toDataURL(file.type)


            //const blobData = this.dataURLToBlob(dataUrl) // as png?
            if (file.size <= MAX_FILE_SIZE_MB * 1024 * 1024) {

                this.setState({uploading: true, successMessage: null, errorMessage: null, uploadCompleted: 0})
                this.dataURLtoBlob(dataUrl, (blob) => {

                    const xhr = new XMLHttpRequest()
                    xhr.responseType = 'json'
                    // Progress bar
                    xhr.upload.addEventListener('progress', this.updateFileProgress.bind(this), false)

                    xhr.onload = () => {
                        const {status, message} = xhr.response
                        if (status === 'success') {
                            this.setState({successMessage: 'upload was successfull', uploading: false})
                        } else {
                            this.setState({errorMessage: message, uploading: false})
                        }
                    }

                    xhr.onerror = (e) => {
                        this.setState({errorMessage: e.message, uploading: false})
                    }


                    xhr.open('POST', UPLOAD_URL, true)

                    const fd = new FormData();

                    fd.append('blob', blob, file.name);

                    xhr.send(fd)

                })
            } else {

            }


        }
        oriImg.src = URL.createObjectURL(file)

    }

    dataURLtoBlob(dataUrl, callback) {
        var req = new XMLHttpRequest

        req.open('GET', dataUrl)
        req.responseType = 'arraybuffer' // Can't use blob directly because of https://crbug.com/412752

        req.onload = () => {
            callback(new Blob([req.response], {type: req.getResponseHeader('content-type')}))
        }

        req.send()
    }
}

FileDrop.propTypes = {
    classes: PropTypes.object.isRequired
}

export default withStyles(styles)(FileDrop)