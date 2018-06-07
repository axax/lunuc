/*
 A very basic mime type detection implementation
 */
import path from 'path'

// mime type mapping
const MIME_TYPES = {
    'html': 'text/html',
    'jpeg': 'image/jpeg',
    'jpg': 'image/jpeg',
    'png': 'image/png',
    'ico': 'image/x-icon',
    'js': 'text/javascript',
    'json': 'application/json',
    'css': 'text/css',
    'mp3': 'audio/mpeg',
    'gz': 'application/gzip',
    'zip': 'application/zip',
}



const MimeType = {
    detectByFileName: function (fileName) {
        const ext = path.extname(fileName).split('.')[1]
        return this.detectByExtension(ext)
    },
    detectByExtension: function (ext) {
        return MIME_TYPES[ext]
    }
}

export default MimeType