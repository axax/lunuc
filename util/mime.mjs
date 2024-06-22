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
    'tif': 'image/tiff',
    'webp': 'image/webp',
    'ico': 'image/x-icon',
    'heic': 'image/heic',
    'js': 'text/javascript',
    'mjs': 'text/javascript',
    'cjs': 'text/javascript',
    'json': 'application/json',
    'css': 'text/css',
    'mp3': 'audio/mp3',
    'wav': 'audio/wav',
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'weba': 'video/webm',
    'mov': 'video/quicktime',
    'm4a': 'audio/x-m4a',
    'm4b': 'audio/mp4a-latm',
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

const MIME_TYPE_COMPRESSIBLE = [
    'application/x-javascript',
    'application/javascript',
    'application/json',
    'application/manifest+json',
    'application/vnd.api+json',
    'application/xml',
    'application/xhtml+xml',
    'application/rss+xml',
    'application/atom+xml',
    'application/vnd.ms-fontobject',
    'application/x-font-ttf',
    'application/x-font-opentype',
    'application/x-font-truetype',
    'image/svg+xml',
    'image/x-icon',
    'image/vnd.microsoft.icon',
    'font/ttf',
    'font/eot',
    'font/otf',
    'font/opentype'
]

const DEFAULT_MIME_TYPE = 'application/octet-stream'

const MimeType = {
    inCompressible:(mimeType)=>{
        if(!mimeType){
            return false
        }
        return mimeType.startsWith('text/') || MIME_TYPE_COMPRESSIBLE.indexOf(mimeType)>=0
    },
    detectByFileName: function (fileName) {
        let ext = path.extname(fileName)
        if(ext) {
            ext = ext.substring(1).toLowerCase()
        }
        return this.detectByExtension(ext)
    },
    detectByExtension: function (ext) {
        if (MIME_TYPES[ext]) {
            return MIME_TYPES[ext]
        }
        return DEFAULT_MIME_TYPE
    },
    takeOrDetect: (mimeType, parsedUrl) => {
        if(mimeType){
            return mimeType
        }
        if(parsedUrl){
            if(parsedUrl.query && parsedUrl.query.ext){
                // if set by query parameter
                // should not be used anymore
                return MimeType.detectByExtension(parsedUrl.query.ext)
            }else if(parsedUrl.pathname){
                return MimeType.detectByFileName(parsedUrl.pathname)
            }
        }
        return DEFAULT_MIME_TYPE
    }
}

export default MimeType
