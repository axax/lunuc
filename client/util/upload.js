import Util from 'client/util'

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
    resizeImageFromFile: ({file, maxWidth, maxHeight, quality, onSuccess}) => {

        const oriImg = new Image()
        oriImg.onload = () => {

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
    }
}
export default UploadUtil