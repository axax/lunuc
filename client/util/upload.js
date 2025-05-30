import Util from 'client/util/index.mjs'

/**
 * Object with helper methods to handle file upload
 */
const UploadUtil = {
    uploadData: ({dataUrl, fileName, uploadTo, onProgress, onError, onLoad, data}) => {

        UploadUtil.dataURLtoBlob(dataUrl, (blob) => {

            const xhr = new XMLHttpRequest()
            xhr.timeout = 1000 * 60 * 60

            xhr.responseType = 'json'
            // Progress bar
            if(onProgress) {
                xhr.upload.addEventListener('progress', onProgress, false)
            }
            xhr.onload = onLoad
            xhr.onerror = onError


            xhr.open('POST', uploadTo, true)
            const token = Util.getAuthToken()
            if(token) {
                xhr.setRequestHeader('Authorization', token)
            }
            const fd = new FormData()
            if (data) {
                Object.keys(data).forEach(key => {
                    fd.append(key, JSON.stringify(data[key]))
                })
            }
            fd.append('blob', blob, fileName)
            xhr.send(fd)

        })
    },
    dataURLtoBlob: (dataUrl, callback) => {
        const req = new XMLHttpRequest

        req.open('GET', dataUrl)
        req.responseType = 'arraybuffer' // Can't use blob directly because of https://crbug.com/412752

        req.onload = () => {
            callback(new Blob([req.response], {type: req.getResponseHeader('content-type')}))
        }

        req.send()
    },
    resizeImageFromFile: ({file, conversion, onSuccess}) => {

        if (!conversion || !conversion.length) {

            // nothing to convert
            onSuccess(URL.createObjectURL(file))
            return
        }

        const oriImg = new Image()
        oriImg.onload = () => {

            //TODO support for multiple conversions
            const {maxWidth, maxHeight, quality, type} = conversion[0]

            let width = oriImg.width, height = oriImg.height

            if ( maxWidth!== undefined && (width > height || maxHeight===undefined)) {
                if (width > maxWidth) {
                    height *= maxWidth / width
                    width = maxWidth
                }
            } else {
                if (height > maxHeight) {
                    width *= maxHeight / height
                    height = maxHeight
                }
            }
            const canvas = document.createElement('canvas')
            canvas.width = width
            canvas.height = height

            const ctx = canvas.getContext('2d')
            ctx.clearRect(0, 0, width, height)
            ctx.drawImage(oriImg, 0, 0, width, height)

            //Some update on canvas
            /*  ctx.font = '30px serif'
             ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'
             ctx.fillText(file.name, 5, height - 8)*/

            const dataUrl = canvas.toDataURL(type || file.type, quality)
            onSuccess(dataUrl)

        }
        oriImg.src = URL.createObjectURL(file)
    },
    isImage: (fileName) => {
        return (/\.(?=gif|jpg|png|jpeg)/gi).test(fileName)
    },
    validateFiles: ({files, accept, maxFileSize}) => {
        const results = {validFiles: [], invalidFiles: []}
        if (files) {
            const accepts = accept.split(/[|,]/), acceptsType = [], acceptsExt = []
            accepts.forEach(i => {
                const a = i.split('/')
                if (a.length > 1) {
                    acceptsType.push(a[0])
                    acceptsExt.push(a[1])
                } else {
                    acceptsExt.push(a[0])
                }

            })

            // Process all File objects
            const images = [], filteredFiles = []
            for (let i = 0, file; file = files[i]; i++) {

                if (maxFileSize && file.size > maxFileSize) {
                    results.invalidFiles.push({
                        file,
                        message: `File size of ${file.name} exceeds the max file size of ${maxFileSize / 1024 / 1024}MB.`
                    })
                    continue
                }

                // validate
                const aType = file.type.split('/')

                const ext = aType.length > 1 ? aType[1] : aType[0]
                const isImage = UploadUtil.isImage(file.name)

                let isValid = false
                acceptsExt.forEach(e => {
                    if (ext === e) {
                        isValid = true
                        return
                    } else if (e === '*') {
                        acceptsType.forEach(type => {
                            if (type === '*' || (type === 'image' && isImage)  || (type === 'video')) {
                                isValid = true
                                return
                            }
                        })
                        if (isValid) {
                            return
                        }
                    }
                })

                if (isValid) {
                    results.validFiles.push(file)
                } else {
                    results.invalidFiles.push({file, message: `File format ${file.type} is not accepted`})
                }
            }
        }
        return results
    }
}
export default UploadUtil
