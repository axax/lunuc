import Util from 'client/util/index.mjs'

/**
 * Object with helper methods to handle file upload
 */
const UploadUtil = {
    uploadData: ({dataUrl, blob: givenBlob, fileName, uploadTo, onProgress, onError, onLoad, data}) => {

        // If a Blob/File is given directly it is sent as is (streamed by the
        // browser). Only fall back to the dataUrl -> ArrayBuffer -> Blob
        // roundtrip when needed (e.g. resized images). That roundtrip loads
        // the whole file into one ArrayBuffer, which fails for files > ~2GB:
        // xhr.response is then null and new Blob([null]) uploads the 4 bytes "null".
        const withBlob = givenBlob ? (cb) => cb(givenBlob) : (cb) => UploadUtil.dataURLtoBlob(dataUrl, cb, onError)

        withBlob((blob) => {

            const xhr = new XMLHttpRequest()
            xhr.timeout = 1000 * 60 * 60

            xhr.responseType = 'json'
            // Progress bar
            if(onProgress) {
                xhr.upload.addEventListener('progress', onProgress, false)
            }
            xhr.onload = onLoad
            xhr.onerror = onError
            xhr.ontimeout = onError
            xhr.onabort = onError


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
    dataURLtoBlob: (dataUrl, callback, onError) => {
        const req = new XMLHttpRequest

        req.open('GET', dataUrl)
        req.responseType = 'arraybuffer' // Can't use blob directly because of https://crbug.com/412752

        req.onload = () => {
            if (!req.response) {
                // e.g. file too large for a single ArrayBuffer
                console.error('dataURLtoBlob: could not read file data')
                if (onError) {
                    onError(new Error('Could not read file data'))
                }
                return
            }
            callback(new Blob([req.response], {type: req.getResponseHeader('content-type')}))
        }
        req.onerror = (e) => {
            if (onError) {
                onError(e)
            }
        }

        req.send()
    },
    // target size for a conversion, null when the image does not have to be scaled down
    _scaledSize: (width, height, {maxWidth, maxHeight}) => {
        let w = width, h = height
        if (maxWidth !== undefined && (w > h || maxHeight === undefined)) {
            if (w > maxWidth) {
                h *= maxWidth / w
                w = maxWidth
            }
        } else if (maxHeight !== undefined && h > maxHeight) {
            w *= maxHeight / h
            h = maxHeight
        }
        w = Math.round(w)
        h = Math.round(h)
        return w === width && h === height ? null : {width: w, height: h}
    },
    /**
     * Scales an image down according to conversion[0] and resolves with a Blob.
     * Resolves with the original file when nothing has to be done (already small enough and no
     * other output type) or when the image cannot be decoded. Never rejects.
     * Works without a base64 data url (no blocking toDataURL, no ArrayBuffer roundtrip) and
     * decodes / encodes off the main thread where the browser supports it.
     */
    resizeImageToBlob: async ({file, conversion}) => {
        if (!conversion || !conversion.length || typeof createImageBitmap === 'undefined') {
            return file
        }
        const {quality, type} = conversion[0]
        const outputType = type || file.type
        let bitmap
        try {
            bitmap = await createImageBitmap(file)
            const size = UploadUtil._scaledSize(bitmap.width, bitmap.height, conversion[0])
            if (!size && outputType === file.type) {
                // already small enough: re-encoding would only cost time and quality
                return file
            }
            const {width, height} = size || {width: bitmap.width, height: bitmap.height}
            if (typeof OffscreenCanvas !== 'undefined') {
                const canvas = new OffscreenCanvas(width, height)
                canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)
                return await canvas.convertToBlob({type: outputType, quality})
            }
            const canvas = document.createElement('canvas')
            canvas.width = width
            canvas.height = height
            canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)
            const blob = await new Promise(resolve => canvas.toBlob(resolve, outputType, quality))
            return blob || file
        } catch (e) {
            console.warn('resizeImageToBlob: upload original file', e)
            return file
        } finally {
            bitmap?.close?.()
        }
    },
    // legacy callback api with a data url (used where the data url is needed as value)
    // onSuccess(null) when the image cannot be read -> callers upload the original file
    resizeImageFromFile: ({file, conversion, onSuccess, onError}) => {

        if (!conversion || !conversion.length) {

            // nothing to convert
            onSuccess(URL.createObjectURL(file))
            return
        }

        const objectUrl = URL.createObjectURL(file)
        const oriImg = new Image()
        oriImg.onload = () => {
            URL.revokeObjectURL(objectUrl)

            //TODO support for multiple conversions
            const {quality, type} = conversion[0]
            const {width, height} = UploadUtil._scaledSize(oriImg.width, oriImg.height, conversion[0]) ||
                {width: oriImg.width, height: oriImg.height}

            const canvas = document.createElement('canvas')
            canvas.width = width
            canvas.height = height

            const ctx = canvas.getContext('2d')
            ctx.clearRect(0, 0, width, height)
            ctx.drawImage(oriImg, 0, 0, width, height)

            const dataUrl = canvas.toDataURL(type || file.type, quality)
            onSuccess(dataUrl)

        }
        oriImg.onerror = (e) => {
            URL.revokeObjectURL(objectUrl)
            console.warn('resizeImageFromFile: could not decode image', file.name)
            if (onError) {
                onError(e)
            } else {
                onSuccess(null)
            }
        }
        oriImg.src = objectUrl
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
