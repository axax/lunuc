import {getType, getTypes, getTypeQueries} from '../../util/types.mjs'
import DomUtil from './dom.mjs'
import config from '../../gensrc/config-client.js'
import {replacePlaceholders} from '../../util/placeholders.mjs'
import {propertyByPath, setPropertyByPath, isString} from './json.mjs'
import {_t} from '../../util/i18n.mjs'

/**
 * Object with general client helper methods. It is also accessible in the CMS Editor
 */
const JSON_ESCAPE_MAP = {'\\': '\\\\', '\"': '\\\"', '\b': '\\b', '\f': '\\f', '\n': '\\n', '\r': '\\r', '\t': '\\t'}
const DATE_FORMATS = {}

const Util = {
    getType: getType,
    getTypes: getTypes,
    setPropertyByPath: setPropertyByPath,
    propertyByPath: propertyByPath,
    getTypeQueries: getTypeQueries,
    replacePlaceholders: replacePlaceholders,
    escapeDoubleQuotes: (str) => {
        if (isString(str)) {
            return str.replace(/"/g, '\\"')
        }
        return str
    },
    safeStr: (str, defaultStr='') =>{
        return str ? str.replace(/[^a-zA-Z0-9öäüÖÜÄ\s\-_]/g, ''): defaultStr
    },
    safeTags: str => {
        return str ? str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : ''
    },
    removeControlChars: str => {
        if (isString(str)) {
            // https://en.wikipedia.org/wiki/Control_character#In_Unicode
            return str.replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
        }
        return str
    },
    escapeForJson: (str, options) => {
        if (str === undefined || str === null) return ''
        if (!isString(str))
            str = JSON.stringify(str)
        if (options) {

            if(options.literals){
                str = str.replace(/\$\{[^}]+\}/g, '')
            }

            if (options.regex) {
                str = Util.escapeRegex(str)
            }

            if (options.removeControlChars) {
                str = Util.removeControlChars(str)
            }
        }

        return str.replace(/[\\]|[\"]|[\b]|[\f]|[\n]|[\r]|[\t]/g, (matched) => {
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
        if (!Util._intl) {
            Util._intl = Intl.DateTimeFormat().resolvedOptions()
        }
        if (!lang) {
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

        if (o.timeZone === 'Europe/Zurich') {
            o.timeZone = 'Europe/Oslo'
        }
        if (!DATE_FORMATS[key]) {
            // cache formats as Intl.DateTimeFormat has bad performance
            try {
                DATE_FORMATS[key] = new Intl.DateTimeFormat(lang, o)
            } catch (e) {
                console.log(e)
            }
        }
        return DATE_FORMATS[key] || {format: (d) => d}
    },
    formattedDateFromObjectId: (objectId, options) => {
        return Util.getDateTimeFormat(options).format(Util.dateFromObjectId(objectId, new Date()))
    },
    formattedDatetimeFromObjectId: (objectId) => {
        return Util.getDateTimeFormat().format(Util.dateFromObjectId(objectId, new Date()))
    },
    formattedDatetime(stamp, options) {
        if (!isString(stamp)) return ''
        if (stamp.indexOf('-') < 0) {
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
    /*textFromHtml: str => {
        if (str.constructor !== String) return str
        return str.replace(/<[^>]+>/g, ' ').replace(/\s/g, ' ')
    },*/
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
            }else if(obj[prop] === 0){
                if (options.removeZero) {
                    delete obj[prop]
                }
            }else if(obj[prop] === ''){
                if (options.removeEmpty) {
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

        const a = (options.decodeURI === false ? query : decodeURI(query)).split('&'), b = {}
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
        const userData = user ? user.userData ? user.userData : user : {}
        const capabilities = (userData.role && userData.role.capabilities) || []
        return capabilities.indexOf(capa) >= 0
    },
    hightlight(text, query, options) {
        if (!text) return ''
        if (!query) return text

        let className, style
        if (options && options.constructor === Object) {
            className = options.className
            style = options.style
        } else {
            className = options
        }

        const pattern = new RegExp(`(${query.replace(/\s/g, '|')})`, 'gi');

        return text.replace(pattern, match => `<span style='${style || ''}' class='${className || ''}'>${match}</span>`);
    },
    /*getProfileImage(userAny) {
        const user = userAny && userAny.userData ? userAny.userData : userAny
        if (user && user.picture) {

            return _app_.config.UPLOAD_URL + '/' + (user.picture._id ? user.picture._id : user.picture)
        }
        return '/placeholder.svg'
    },*/
    getMediaSrc(media, src) {
        return src ? src : (media.src ? media.src : _app_.config.UPLOAD_URL + '/' + media._id)
    },
    getImageObject(raw, options) {
        if(!options){
            options = {}
        }
        let image
        const data = {}, resize = options.resize

        if (!raw) {
            if(options.placeholder){
                data.src = options.placeholder
            }else if (resize && resize.height && resize.width) {
                data.width = resize.width
                data.height = resize.height
                data.src = Util.createDummySvg(resize.width, resize.height)
            } else {
                data.src = '/placeholder.svg'
            }
            data.alt = 'Placeholder'
            return data
        } else if (isString(raw)) {
            image = {
                src: raw
            }
            if (raw.startsWith('[') || raw.startsWith('{')) {
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
        if(image._localized){
            image = _t(image)
            if(isString(image)){
                image = {src:image}
            }
        }
        if (Array.isArray(image)) {
            image = image[0]
        }
        if (!image) {
            return data
        }
        if (image.name) {
            data.alt = image.name
        }
        if (!image.src) {
            data.src = _app_.config.UPLOAD_URL + '/' + image._id + '/' + config.PRETTYURL_SEPERATOR + '/' + image.name
        } else {
            data.src = image.src
        }

        if(!data.alt){
            data.alt = data.src.split('/').pop().split('?')[0]
        }

        if(image.info){
            data.width = image.info.width
            data.height = image.info.height
        }

        if (_app_.ssr && !data.src.startsWith('https://') && !data.src.startsWith('http://')) {
            try {
                data.src = new URL(data.src, location.origin).href
            } catch (e) {
                console.error(e, data.src)
            }
        }

        let h, w, params = ''
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
                if(!h && data.height && data.width){
                    data.height = Math.ceil((w / data.width) * data.height)
                }
                data.width = w
                params += `&width=${w}`
            }
            if (h) {
                if(!w && data.height && data.width){
                    data.width = Math.ceil((h / data.height) * data.width)
                }
                data.height = h
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

        if (options.flop) {
            params += '&flop=true'
        }
        if (options.flip) {
            params += '&flip=true'
        }
        if (options.position) {
            params += '&position=' + options.position
        }
        if (options.noenlarge) {
            params += '&noenlarge=' + options.noenlarge
        }
        if (params && options.addParams!==false) {
            data.src += (data.src.indexOf('?')>=0?'&':'?') + params.substring(1)
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
    removeSlugContext(url) {
        const sc = _app_.slugContext
        if (sc && url && (url === '/'+sc || url.indexOf('/'+sc+'/')===0)) {
            url = url.substring(sc.length + 1)
            if (!url) {
                url = '/'
            }
        }
        return url
    },
    baseUrl(path, query) {
        const seperator = config.PRETTYURL_SEPERATOR
        let url = Util.removeTrailingSlash(location.pathname.split('/' + seperator + '/')[0])

        if (path) {
            url += '/' + seperator + '/' + encodeURI(path)
        }
        if (query) {
            const queryStr = Util.paramsToQuery(query)
            if (queryStr) {
                url += '?' + queryStr
            }
        }

        return url
    },
    removeTrailingSlash(url) {
        if (url !== '/' && url.substr(-1) === '/') {
            return url.substr(0, url.length - 1)
        }
        return url
    },
    urlContext(path) {
        const parts = path.split('/')
        let contextLanguage = parts.length > 1 ? parts[1].split('?')[0].split('#')[0].toLowerCase() : ''
        if(config.LANGUAGES.indexOf(contextLanguage) < 0){
            contextLanguage = ''
        }
        return contextLanguage
    },
    setUrlContext(path) {
        const contextLanguage = Util.urlContext(path)
        if(contextLanguage){
            _app_.contextPath =  '/' + contextLanguage
        }else if(_app_.contextPath === '/' + config.DEFAULT_LANGUAGE){
            _app_.contextPath = ''
        }
        return contextLanguage
    },
    addUrlContext(path) {
        if(path && _app_.contextPath && _app_.contextPath !== '/' + config.DEFAULT_LANGUAGE && (path.indexOf('/')===0 || path.indexOf('?')===0) && !Util.urlContext(path)){
            return _app_.contextPath + path
        }
        return path
    },
    translateUrl(lang) {
        const loc = window.location
        let path = loc.pathname
        if (lang && lang !== _app_.lang){
            const contextLanguage = Util.urlContext(path)
            if(contextLanguage){
                path = path.substring(contextLanguage.length+1)
            }
            path = '/' + lang + path
        }
        return path + loc.search + loc.hash
    },
    /*createWorker(fn) {
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
    },*/
    // a simple implementation of the shallowCompare.
    // only compares the first level properties and hence shallow.
    shallowCompare(newObj, prevObj, options = {}) {
        if (!newObj || newObj.constructor !== Object) {
            return newObj !== prevObj
        }
        if (!prevObj || prevObj.constructor !== Object) {
            return newObj !== prevObj
        }
        for (const key in newObj) {
            const v1 = newObj[key], v2 = prevObj[key]

            if ((!options.ignoreKeys || options.ignoreKeys.indexOf(key) < 0) && v1 !== v2) {
                if(options.compareArray && v1 && v1.constructor===Array && v2 && v2.constructor === Array && v1.length === v2.length){
                    for(let i = 0;i<v1.length;i++){
                        if(this.shallowCompare(v1[i],v2[i],options)){
                            return true
                        }
                    }
                    return false
                }
                return true
            }
        }
        return false
    },
    chunkArray(arr, chunk, opts) {

        if (!arr || arr.constructor !== Array) {
            return []
        }

        if(opts && opts.randomize) {
            arr.sort(() => Math.random() - 0.5)
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
/*console.log('xxxxx',
Util.shallowCompare({"icons":[{"name":"facebook","url":"https://www.facebook.com/pokerhelden.ch"},{"name":"instagram","url":"https://www.instagram.com/pokerhelden.ch"},{"url":"https://www.twitch.tv/pokerhelden","name":"twitch"},{"name":"youtube","url":"https://www.youtube.com/channel/UCBGIo7_PqA8vKVzWO5TP-JA"}]},
{"icons":[{"name":"facebook","url":"https://www.facebook.com/pokerhelden.ch"},{"name":"instagram","url":"https://www.instagram.com/pokerhelden.ch"},{"url":"https://www.twitch.tv/pokerhelden","name":"twitch"},{"name":"youtube","url":"https://www.youtube.com/channel/UCBGIo7_PqA8vKVzWO5TP-JA"}]}))*/