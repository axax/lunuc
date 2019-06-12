/*
 A very basic mime type detection implementation
 */
import path from 'path'

// mime type mapping
const MIME_TYPES = {
    'html': 'text/html',
    'text': 'text/plain',
    'jpeg': 'image/jpeg',
    'jpg': 'image/jpeg',
    'gif': 'image/gif',
    'png': 'image/png',
    'ico': 'image/x-icon',
    'js': 'text/javascript',
    'json': 'application/json',
    'css': 'text/css',
    'mp3': 'audio/mpeg',
    'gz': 'application/gzip',
    'zip': 'application/zip',
    'svg': 'image/svg+xml'
}


const MimeType = {
    detectByFileName: function (fileName) {
        const ext = path.extname(fileName).split('.')[1].toLowerCase()
        return this.detectByExtension(ext)
    },
    detectByExtension: function (ext) {
        if (MIME_TYPES[ext]) {
            return MIME_TYPES[ext]
        }
        return 'application/octet-stream'
    }
}

export default MimeType
