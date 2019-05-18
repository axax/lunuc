import Util from 'client/util'

/**
 * Object with helper methods to handle file upload
 */
const UploadUtil = {
    uploadData: ({dataUrl, fileName, uploadTo, onProgress, onError, onLoad}) => {

        UploadUtil.dataURLtoBlob(dataUrl, (blob) => {

            const xhr = new XMLHttpRequest()
            xhr.responseType = 'json'
            // Progress bar
            xhr.upload.addEventListener('progress', onProgress, false)
            xhr.onload = onLoad
            xhr.onerror = onError


            xhr.open('POST', uploadTo, true)
            xhr.setRequestHeader('Authorization', Util.getAuthToken())

            const fd = new FormData()
            fd.append('blob', blob, fileName)
            xhr.send(fd)

        })
    },
    dataURLtoBlob: (dataUrl, callback) => {
        var req = new XMLHttpRequest

        req.open('GET', dataUrl)
        req.responseType = 'arraybuffer' // Can't use blob directly because of https://crbug.com/412752

        req.onload = () => {
            callback(new Blob([req.response], {type: req.getResponseHeader('content-type')}))
        }

        req.send()
    },
    resizeImageFromFile: ({file, conversion, onSuccess}) => {

        const oriImg = new Image()
        oriImg.onload = () => {

            //TODO support for multiple conversions
            const {maxWidth, maxHeight, quality} = conversion[0]

            let width = oriImg.width, height = oriImg.height

            if (width > height) {
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

console.log(conversion)
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


            const dataUrl = canvas.toDataURL(file.type, quality)
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
            const accepts = accept.split('|'), acceptsType = [], acceptsExt = []
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
                        message: `File size of ${file.name} exceeds the max file size of ${maxFileSize/1024/1024}MB.`
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
                            if (type === '*' || (type === 'image' && isImage)) {
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