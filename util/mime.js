/*
 A very basic mime type detection implementation
 */
import path from 'path'

// mime type mapping
const MIME_TYPES = {
    'html': 'text/html',
    'text': 'text/plain',
    'txt': 'text/plain',
    'xml': 'text/xml',
    'jpeg': 'image/jpeg',
    'jpg': 'image/jpeg',
    'gif': 'image/gif',
    'png': 'image/png',
    'ico': 'image/x-icon',
    'js': 'text/javascript',
    'json': 'application/json',
    'css': 'text/css',
    'mp3': 'audio/mp3',
    'mp4': 'video/mp4',
    'm4a': 'audio/x-m4a',
    'gz': 'application/gzip',
    'zip': 'application/zip',
    'svg': 'image/svg+xml',
    'pdf': 'application/pdf',
    'eot': 'application/vnd.ms-fontobject',
    'ttf': 'font/ttf',
    'woff': 'font/woff',
    'woff2': 'font/woff2',
    'otf': 'font/otf'
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
