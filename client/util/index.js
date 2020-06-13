import {getType, getTypes, getTypeQueries} from 'util/types'
import DomUtil from 'client/util/dom'
import md5 from 'util/md5'
import config from 'gen/config'

/**
 * Object with general client helper methods. It is also accessible in the CMS Editor
 */
const Util = {
    getType: getType,
    getTypes: getTypes,
    getTypeQueries: getTypeQueries,
    escapeDoubleQuotes: (str) => {
        if (str && str.constructor === String) {
            return str.replace(/"/g, '\\"')
        }
        return str
    },
    escapeForJson: (str) => {
        if (str === undefined || str === null) return ''
        if (str.constructor !== String)
            str = JSON.stringify(str)

        return str.replace(/[\\]/g, '\\\\')
            .replace(/[\"]/g, '\\\"')
            /*.replace(/[\/]/g, '\\/')*/
            .replace(/[\b]/g, '\\b')
            .replace(/[\f]/g, '\\f')
            .replace(/[\n]/g, '\\n')
            .replace(/[\r]/g, '\\r')
            .replace(/[\t]/g, '\\t')
    },
    /* don't use arrow function use regular function instead. otherwise bind cannot be applied */
    tryCatch: function (str, ignoreError) {
        try {
            return new Function(`const {${Object.keys(this).join(',')}} = this; return ${str}`).bind(this).call()
        } catch (e) {
            if (!ignoreError)
                console.log(e, str)
        }

        return ''
    },
    getAuthToken: () => {
        // get the authentication token from local storage if it exists
        const token = localStorage.getItem('token')
        return token ? `JWT ${token}` : null
    },
    dateFromObjectId: (objectId) => {
        if (!objectId) {
            return ''
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
        return new Intl.DateTimeFormat(lang || _app_.lang || Intl.DateTimeFormat().resolvedOptions().locale, Object.assign({
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric',
        }, options))
    },
    formattedDateFromObjectId: (objectId, options) => {
        if (objectId === 0) {
            return new Util.getDateTimeFormat(options).format(new Date())
        }
        return Util.getDateTimeFormat(options).format(Util.dateFromObjectId(objectId))
    },
    formattedDatetimeFromObjectId: (objectId) => {
        if (objectId === 0) {
            return Util.getDateTimeFormat().format(new Date())
        }
        return Util.getDateTimeFormat().format(Util.dateFromObjectId(objectId))
    },
    formattedDatetime(stamp) {
        if (!stamp) return ''
        if (typeof stamp === 'string') {
            stamp = parseFloat(stamp);
        }

        return Util.getDateTimeFormat().format(new Date(stamp))
        //return new Date(stamp).toLocaleString()
    },
    formatDate(d, options) {
        try {
            return Util.getDateTimeFormat(options).format(new Date(d))
        } catch (e) {
            return ''
        }
        /*(new Date(d)).toLocaleString(options && options.lang ? options.lang : _app_.lang, Object.assign({
        year: 'numeric',
        month: '2-digit',
        day: 'numeric'
    }, options))*/
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
            if (obj[prop] !== null) {
                if (obj[prop].constructor === Array) {
                    if( options.emptyArray &&  obj[prop].length === 0) {
                        //remove empty arrays
                        delete obj[prop]
                    }else if(options.recursiv){
                        obj[prop].forEach(aObj=>{
                            if( aObj && aObj.constructor===Object){
                                Util.removeNullValues(aObj, options)
                            }
                        })
                    }
                }else if(options.recursiv && obj[prop].constructor === Object ){
                    Util.removeNullValues(obj[prop], options)
                    if( options.emptyObject && Object.keys(obj[prop]).length === 0){
                        delete obj[prop]
                    }
                }
            }else{
                delete obj[prop]
            }
        })
        return obj
    },
    extractQueryParams: (query, typeDetection) => {
        if (!query) {
            query = window && window.location.search.substring(1)
        }

        var a = query.split('&')

        var b = {}
        for (let i = 0; i < a.length; ++i) {
            var p = a[i].split('=', 2)
            if (p[0]) {
                if (p.length === 1)
                    b[p[0]] = ''
                else {
                    const str = p[1].replace(/\+/g, ' ')
                    if (typeDetection) {
                        if (str === 'true') {
                            b[p[0]] = true
                        } else if (str === 'false') {
                            b[p[0]] = false
                        } else {
                            b[p[0]] = decodeURIComponent(str)
                        }

                    } else {
                        b[p[0]] = decodeURIComponent(str)
                    }
                }
            }
        }
        return b
    },
    hasCapability(user, capa) {
        const capabilities = (user && user.userData && user.userData.role && user.userData.role.capabilities) || []
        return capabilities.indexOf(capa) >= 0
    },
    hightlight(text, query, cls) {
        if (!text) return ''
        if (!query) return text

        const pattern = new RegExp(`(${query.replace(/\s/g, '|')})`, 'gi');

        return text.replace(pattern, match => `<span class='${cls || ''}'>${match}</span>`);
    },
    getProfileImage(userAny) {
        const user = userAny && userAny.userData ? userAny.userData : userAny
        if (user && user.picture) {

            return _app_.config.UPLOAD_URL + '/' + (user.picture._id ? user.picture._id : user.picture)
        }
        return 'https://gravatar.com/avatar/' + md5(user ? user.email : '') + '?s=50&r=pg&d=mp'
    },
    getMediaSrc(media, src) {
        return src ? src : (media.src ? media.src : _app_.config.UPLOAD_URL + '/' + media._id)
    },
    getImageObject(raw, options) {
        let image
        if (!raw) {
            return {
                src: '/placeholder.svg',
                alt: 'Placeholder'
            }
        } else if (raw.constructor === String) {
            try {
                image = JSON.parse(raw)
            } catch (e) {
                return {
                    src: raw,
                    alt: raw
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
        const data = {alt: image.name}
        if (!image.src) {
            data.src = _app_.config.UPLOAD_URL + '/' + image._id + '/' + config.PRETTYURL_SEPERATOR + '/' + image.name

            if (options) {
                let params = '?'
                if (options.resize) {

                    if (options.resize === 'auto') {
                        if (window.innerWidth <= 800) {
                            params += `width=800`
                        } else if (window.innerWidth <= 1200) {
                            params += `width=1200`
                        }
                    } else {
                        params += `width=${options.resize.width}&height=${options.resize.height}`
                    }
                }
                if (options.quality) {
                    if (params !== '?') {
                        params += '&'
                    }
                    params += `quality=${options.quality}`
                }

                if (options.webp) {

                    if (params !== '?') {
                        params += '&'
                    }
                    params += 'format=webp'
                }
                data.src += params
            }
        } else {
            data.src = image.src
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
    replacePlaceholders(template, context, name) {
        if (name !== undefined) {
            const re = new RegExp('\\$\\.' + name + '{', 'g')
            template = template.replace(re, '${')
        }
        return new Function(DomUtil.toES5('const {' + Object.keys(context).join(',') + '} = this.context;return `' + template + '`')).call({context})
    },
    translateUrl(lang) {
        if (lang === _app_.lang) return
        const p = window.location.pathname.split('/')
        if (p[1].length === 2 && p[1] !== lang) {
            if (lang === '') {
                //default language
                p.splice(1, 1)
            } else {
                p[1] = lang
            }
        } else {
            p.splice(1, 0, lang);
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
    shallowCompare(newObj, prevObj) {
        if (!newObj || newObj.constructor !== Object) {
            return newObj !== prevObj
        }
        if (!prevObj || prevObj.constructor !== Object) {
            return newObj !== prevObj
        }
        for (const key in newObj) {
            if (newObj[key] !== prevObj[key]) {
                return true
            }
        }
        return false
    },
    chunkArray(arr, chunk) {

        let chunkInt = parseInt(chunk)

        if (!isNaN(chunkInt)) {
            chunkInt = parseInt(new Function('return `' + chunk + '`').call({}))
        }

        if (!isNaN(chunkInt)) {
            return arr.reduce((all, one, i) => {
                const ch = Math.floor(i / chunkInt)
                all[ch] = [].concat((all[ch] || []), one)
                return all
            }, [])
        }
        return arr
    }
}
export default Util
