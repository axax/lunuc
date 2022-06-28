import {getType, getTypes, getTypeQueries} from '../../util/types.mjs'
import DomUtil from './dom.mjs'
import config from '../../gensrc/config-client.js'
import {replacePlaceholders} from '../../util/placeholders.mjs'

/**
 * Object with general client helper methods. It is also accessible in the CMS Editor
 */
const JSON_ESCAPE_MAP = {'\\':'\\\\','\"':'\\\"','\b':'\\b','\f':'\\f','\n':'\\n','\r':'\\r','\t':'\\t'}
const DATE_FORMATS = {}

const Util = {
    getType: getType,
    getTypes: getTypes,
    getTypeQueries: getTypeQueries,
    replacePlaceholders: replacePlaceholders,
    escapeDoubleQuotes: (str) => {
        if (str && str.constructor === String) {
            return str.replace(/"/g, '\\"')
        }
        return str
    },
    safeTags: str => {
        return str ? str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : ''
    },
    escapeForJson: (str, options) => {
       // console.log(str)
        if (str === undefined || str === null) return ''
        if (str.constructor !== String)
            str = JSON.stringify(str)
        if(options){

            if(options.regex){
                str = Util.escapeRegex(str)
            }
        }

        return str.replace(/[\\]|[\"]|[\b]|[\f]|[\n]|[\r]|[\t]/g, (matched)=>{
            return JSON_ESCAPE_MAP[matched]
        })

        /*return str.replace(/[\\]/g, '\\\\')
            .replace(/[\"]/g, '\\\"')
            .replace(/[\b]/g, '\\b')
            .replace(/[\f]/g, '\\f')
            .replace(/[\n]/g, '\\n')
            .replace(/[\r]/g, '\\r')
            .replace(/[\t]/g, '\\t')*/
    },
    escapeRegex: (str) => {
        return str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
    },
    tryCatch: function (str, ignoreError) {
        try {
            return new Function(DomUtil.toES5(`const {${Object.keys(this).join(',')}}=this;return ${str}`)).bind(this).call()
        } catch (e) {
            if (!ignoreError)
                console.log(e, str)
        }

        return ''
    },
    /* deprecated -> set USE_COOKIES=true */
    getAuthToken: () => {
        // get the authentication token from local storage if it exists
        const token = !_app_.noStorage && localStorage.getItem('token')
        return token ? `JWT ${token}` : null

    },
    dateFromObjectId: (objectId, defValue) => {
        if (!objectId) {
            return defValue || ''
        }
        if (objectId.indexOf('#') === 0) {
            // this is only a tmp id / timestemp
            return parseInt(objectId.substring(1))
        }

        return new Date(parseInt(objectId.substring(0, 8), 16) * 1000)
    },
    getDateTimeFormat: (options) => {
        let lang
        if (options) {
            lang = options.lang
        }
        if(!Util._intl) {
            Util._intl = Intl.DateTimeFormat().resolvedOptions()
        }
        if(!lang){
            lang = _app_.lang || Util._intl.locale
        }
        const numeric = 'numeric',
            o = Object.assign({
            year: numeric,
            month: numeric,
            day: numeric,
            hour: numeric,
            minute: numeric,
            second: numeric,
            timeZone: Util._intl.timeZone || 'UTC'
        }, options),
            key = lang + Object.values(o).join('')

        if(o.timeZone==='Europe/Zurich'){
            o.timeZone='Europe/Oslo'
        }
        if(!DATE_FORMATS[key]){
            // cache formats as Intl.DateTimeFormat has bad performance
            try {
                DATE_FORMATS[key] = new Intl.DateTimeFormat(lang, o)
            }catch (e) {
                console.log(e)
            }
        }
        return DATE_FORMATS[key]
    },
    formattedDateFromObjectId: (objectId, options) => {
        return Util.getDateTimeFormat(options).format(Util.dateFromObjectId(objectId, new Date()))
    },
    formattedDatetimeFromObjectId: (objectId) => {
        return Util.getDateTimeFormat().format(Util.dateFromObjectId(objectId, new Date()))
    },
    formattedDatetime(stamp, options) {
        if (!stamp) return ''
        if (typeof stamp === 'string') {
            stamp = parseFloat(stamp);
        }

        return Util.getDateTimeFormat(options).format(new Date(stamp))
    },
    formatDate(d, options) {
        try {
            return Util.getDateTimeFormat(options).format(new Date(d))
        } catch (e) {
            console.log(e.message)
            return ''
        }
    },
    textFromHtml: str => {
        if (str.constructor !== String) return str
        return str.replace(/<[^>]+>/g, ' ').replace(/\s/g, ' ')
    },
    /*escapeHtml: (str) => {
        const entityMap = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            '\'': '&#39;',
            '/': '&#x2F;',
            '`': '&#x60;',
            '=': '&#x3D;'
        }
        return String(str).replace(/[&<>"'`=\/]/g, function (s) {
            return entityMap[s]
        })
    },*/
    removeNullValues: (obj, options = {}) => {
        Object.keys(obj).forEach((prop) => {

            if (obj[prop] === undefined) {
                if (options.removeUndefined) {
                    delete obj[prop]
                }
            } else if (obj[prop] !== null) {
                if (obj[prop].constructor === Array) {
                    if (options.emptyArray && obj[prop].length === 0) {
                        //remove empty arrays
                        delete obj[prop]
                    } else if (options.recursiv) {

                        let index = obj[prop].length - 1

                        while (index >= 0) {
                            const aObj = obj[prop][index]
                            if (aObj && aObj.constructor === Object) {
                                Util.removeNullValues(aObj, options)
                            } else if (options.nullArrayItems && (aObj === null || aObj === undefined)) {
                                obj[prop].splice(index, 1)
                            }
                            index -= 1
                        }
                    }
                } else if (options.recursiv && obj[prop].constructor === Object) {
                    Util.removeNullValues(obj[prop], options)
                    if (options.emptyObject && Object.keys(obj[prop]).length === 0) {
                        delete obj[prop]
                    }
                }
            } else {
                delete obj[prop]
            }
        })
        return obj
    },
    extractQueryParams: (query, options) => {
        if (!options) {
            options = {}
        } else if (options === true) {
            options = {typeDetection: true}
        }

        if (!query) {
            query = window && window.location.search.substring(1)
        }

        const a = (options.decodeURI === false ? query : decodeURI(query)).split('&'),b = {}
        for (let i = 0; i < a.length; ++i) {
            const p = a[i].split('=', 2)
            const key = p[0].trim()
            if (key) {
                if (p.length === 1)
                    b[key] = ''
                else {
                    const str = p[1].replace(/\+/g, ' ').trim()
                    if (options.typeDetection) {
                        if (str === 'true') {
                            b[key] = true
                        } else if (str === 'false') {
                            b[key] = false
                        } else {
                            b[key] = decodeURIComponent(str)
                        }

                    } else {
                        b[key] = decodeURIComponent(str)
                    }
                }
            }
        }
        return b
    },
    paramsToQuery: (obj) => {
        return Object.keys(obj).reduce(function (a, k) {
            if (obj[k] !== undefined && obj[k] !== '') {
                a.push(k + '=' + encodeURIComponent(obj[k]))
            }
            return a
        }, []).join('&')
    },
    hasCapability(user, capa) {
        const capabilities = (user && user.userData && user.userData.role && user.userData.role.capabilities) || []
        return capabilities.indexOf(capa) >= 0
    },
    hightlight(text, query, options) {
        if (!text) return ''
        if (!query) return text

        let className, style
        if(options && options.constructor === Object){
            className = options.className
            style = options.style
        } else {
            className = options
        }

        const pattern = new RegExp(`(${query.replace(/\s/g, '|')})`, 'gi');

        return text.replace(pattern, match => `<span style='${style || ''}' class='${className || ''}'>${match}</span>`);
    },
    getProfileImage(userAny) {
        const user = userAny && userAny.userData ? userAny.userData : userAny
        if (user && user.picture) {

            return _app_.config.UPLOAD_URL + '/' + (user.picture._id ? user.picture._id : user.picture)
        }
        return '/placeholder.svg'
    },
    getMediaSrc(media, src) {
        return src ? src : (media.src ? media.src : _app_.config.UPLOAD_URL + '/' + media._id)
    },
    getImageObject(raw, options) {
        let image
        if (!raw) {
            let src
            if (options && options.resize && options.resize.height && options.resize.width) {
                src = Util.createDummySvg(options.resize.width, options.resize.height)
            } else {
                src = '/placeholder.svg'
            }

            return {
                src,
                alt: 'Placeholder'
            }
        } else if (raw.constructor === String) {
            image = {
                src: raw
            }
            if(raw.startsWith('[') || raw.startsWith('{')) {
                try {
                    image = JSON.parse(raw)
                    if (!image) {
                        image = {
                            src: raw
                        }
                    }
                } catch (e) {
                    console.log(e, raw)
                }
            }
        } else {
            image = raw
        }
        if (Array.isArray(image)) {
            image = image[0]
            if (!image) {
                return {}
            }
        }
        const data = {}
        if (image.name) {
            data.alt = image.name
        }
        if (!image.src) {
            data.src = _app_.config.UPLOAD_URL + '/' + image._id + '/' + config.PRETTYURL_SEPERATOR + '/' + image.name
        } else {
            data.src = image.src
        }

        if (_app_.ssr && !data.src.startsWith('https://') && !data.src.startsWith('http://')) {
            try {
                data.src = new URL(data.src, location.origin).href
            } catch (e) {
                console.error(e, data.src)
            }
        }

        if (options) {
            let resize = options.resize, h, w, params = ''
            if (resize) {

                if (resize.width) {
                    w = resize.width
                }
                if (resize.height) {
                    h = resize.height
                }
                if (resize === 'auto' || resize.responsive) {
                    const ww = window.innerWidth
                    if (!w || w > ww) {
                        if (ww <= 720) {
                            w = 720
                        } else if (ww <= 1024) {
                            w = 1024
                        } else if (ww <= 1200) {
                            w = 1200
                        } else if (ww <= 1400) {
                            w = 1400
                        } else {
                            w = 1600
                        }

                        if (h) {
                            h = Math.ceil((w / resize.width) * h)
                        }
                    }
                }
                if (w) {
                    params += `&width=${w}`
                }
                if (h) {
                    params += `&height=${h}`
                }
            }
            if (options.quality) {
                params += `&quality=${options.quality}`
            }

            if (options.format) {
                params += '&format=' + options.format
            } else if (options.webp) {
                params += '&format=webp'
            }
            if (params) {
                data.src += '?' + params.substring(1)
            }
        }

        return data
    },
    // mini jQuery
    $(expr, p) {
        const nodeList = (p || document).querySelectorAll(expr)
        if (nodeList.length === 1) {
            return nodeList[0]
        }
        return nodeList
    },
    baseUrl(path, query) {
        let url = Util.removeTrailingSlash(location.pathname.split('/'+config.PRETTYURL_SEPERATOR+'/')[0])

        if(path){
            url += '/'+config.PRETTYURL_SEPERATOR+'/'+encodeURI(path)
        }
        if(query){
            const queryStr = Util.paramsToQuery(query)
            if(queryStr) {
                url += '?'+queryStr
            }
        }

        return url
    },
    removeTrailingSlash (url) {
        if(url !== '/' && url.substr(-1) === '/') {
            return url.substr(0, url.length - 1)
        }
        return url
    },
    translateUrl(lang) {
        const path = window.location.pathname
        if (lang === _app_.lang) return path
        const p = path.split('/')
        if (p[1].length === 2 && p[1] !== lang) {
            if (lang === '' || lang === config.DEFAULT_LANGUAGE) {
                //default language
                p.splice(1, 1)
            } else {
                p[1] = lang
            }
        } else {
            p.splice(1, 0, lang)
        }
        return p.join('/') + window.location.search + window.location.hash
    },
    createWorker(fn) {
        const blob = new Blob([`self.onmessage = (args)=>{
                ${fn.toString()}
                self.postMessage(${fn.name}(args))
            }`], {type: 'text/javascript'}),
            url = URL.createObjectURL(blob)

        const worker = new Worker(url)

        return {
            run: (data) => new Promise((resolve) => {
                    worker.addEventListener('message', resolve, false)
                    worker.postMessage(data)
                }
            )
        }
    },
    // a simple implementation of the shallowCompare.
    // only compares the first level properties and hence shallow.
    shallowCompare(newObj, prevObj, options={}) {
        if (!newObj || newObj.constructor !== Object) {
            return newObj !== prevObj
        }
        if (!prevObj || prevObj.constructor !== Object) {
            return newObj !== prevObj
        }
        for (const key in newObj) {
            if ( (!options.ignoreKeys || options.ignoreKeys.indexOf(key)<0) && newObj[key] !== prevObj[key]) {
                return true
            }
        }
        return false
    },
    chunkArray(arr, chunk, opts) {

        if (!arr || arr.constructor !== Array) {
            return []
        }

        let chunkInt = parseInt(chunk)

        if (isNaN(chunkInt)) {
            chunkInt = parseInt(new Function('return `' + chunk + '`').call({}))
        }
        if (!isNaN(chunkInt)) {
            const res = arr.reduce((all, one, i) => {
                const ch = Math.floor(i / chunkInt)
                all[ch] = [].concat((all[ch] || []), one)
                return all
            }, [])

            if (opts && opts.fill && res.length > 0) {
                while (res[res.length - 1].length < chunkInt) {
                    res[res.length - 1].push(opts.fill)
                }
            }
            return res
        }
        return arr
    },
    createDummySvg(width, height) {
        return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='0 0 ${width} ${height}'><rect fill='#dedfe0' width='${width}' height='${height}'/></svg>`)
    }
}
export default Util

