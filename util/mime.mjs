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
    'webp': 'image/webp',
    'ico': 'image/x-icon',
    'js': 'text/javascript',
    'json': 'application/json',
    'css': 'text/css',
    'mp3': 'audio/mp3',
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'weba': 'video/webm',
    'mov': 'video/quicktime',
    'm4a': 'audio/x-m4a',
    'm4v': 'video/x-m4v',
    'gz': 'application/gzip',
    'zip': 'application/zip',
    'svg': 'image/svg+xml',
    'pdf': 'application/pdf',
    'eot': 'application/vnd.ms-fontobject',
    'ttf': 'font/ttf',
    'woff': 'font/woff',
    'woff2': 'font/woff2',
    'otf': 'font/otf',
    'dmg': 'application/octet-stream'
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
