import {getType, getTypes, getTypeQueries} from 'util/types'
import DomUtil from 'client/util/dom'

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
        return new Intl.DateTimeFormat(Intl.DateTimeFormat().resolvedOptions().locale, Object.assign({
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric',
        }, options))
    },
    formattedDateFromObjectId: (objectId) => {
        if (objectId === 0) {
            return new Util.getDateTimeFormat().format(new Date())
        }
        return Util.getDateTimeFormat().format(Util.dateFromObjectId(objectId))
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
        return new Date(stamp).toLocaleString()
    },
    formatDate(d, options) {
        return (new Date(d)).toLocaleString(options && options.lang ? options.lang : _app_.lang, Object.assign({
            year: 'numeric',
            month: '2-digit',
            day: 'numeric'
        }, options))
    },
    textFromHtml: str => {
        if (str.constructor !== String) return str
        return str.replace(/<[^>]+>/g, ' ').replace(/\s/g, ' ')
    },
    escapeHtml: (str) => {
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
    },
    removeNullValues: obj => {
        let newObj = {}
        Object.keys(obj).forEach((prop) => {
            if (obj[prop] !== null) {
                newObj[prop] = obj[prop]
            }
        })
        return newObj
    },
    extractQueryParams: (query, typeDetection) => {
        if (!query) {
            query = window && window.location.search.substring(1)
        }

        var a = query.split('&')

        var b = {}
        for (var i = 0; i < a.length; ++i) {
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
    /* TODO: remove from here. It is currently used in the cms component /shop/component/toolbar */
    parseFilter: filter => {
        const parts = {}, rest = []
        let restString = ''
        if (filter) {
            let operator = 'or'
            filter.split(/ +(?=(?:(?:[^"]*"){2})*[^"]*$)/g).forEach(i => {

                if (i === '') {
                    //ignore
                } else if (i === '||') {
                    operator = 'or'
                } else if (i === '&&') {
                    operator = 'and'
                } else {
                    const comparator = i.match(/==|>=|<=|!=|=|>|<|:/)
                    if (comparator) {

                        let key = i.substring(0, comparator.index)
                        let value = i.substring(comparator.index + comparator[0].length)

                        if (value.length > 1 && value.endsWith('"') && value.startsWith('"')) {
                            value = value.substring(1, value.length - 1)
                        }
                        if (parts[key]) {
                            if (parts[key].constructor !== Array) {
                                parts[key] = [parts[key]]
                            }
                            parts[key].push({value, operator, comparator: comparator[0]})
                        } else {
                            parts[key] = {value, operator, comparator: comparator[0]}
                        }

                    } else {
                        if (i.length > 1 && i.endsWith('"') && i.startsWith('"')) {
                            i = i.substring(1, i.length - 1)
                        }
                        rest.push({value: i, operator, comparator: '='})
                        if (restString !== '') restString += ' '
                        restString += (operator === 'and' ? ' and ' : '') + i
                    }
                    operator = 'or'
                }
            })
        }
        return {parts, rest, restString}
    },
    hasCapability(user, capa) {
        const capabilities = (user && user.userData && user.userData.role && user.userData.role.capabilities) || []
        return capabilities.indexOf(capa) >= 0
    },
    formatBytes(bytes, decimals) {
        if (bytes == 0) return '0 Bytes';
        var k = 1024,
            dm = decimals || 2,
            sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
            i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    },
    hightlight(text, query, cls) {
        if (!text) return ''

        const pattern = new RegExp(`(${query.replace(/\s/g, '|')})`, 'gi');

        return text.replace(pattern, match => `<span class='${cls || ''}'>${match}</span>`);
    },
    md5(s) {
        var k = [], i = 0;

        for (; i < 64;) {
            k[i] = 0 | Math.sin(++i % Math.PI) * 4294967296;
            // k[i] = 0 | (Math.abs(Math.sin(++i)) * 4294967296);
        }

        var b, c, d,
            h = [b = 0x67452301, c = 0xEFCDAB89, ~b, ~c],
            words = [],
            j = unescape(encodeURI(s)) + '\x80',
            a = j.length;

        s = (--a / 4 + 2) | 15;

        // See "Length bits" in notes
        words[--s] = a * 8;

        for (; ~a;) { // a !== -1
            words[a >> 2] |= j.charCodeAt(a) << 8 * a--;
        }


        for (i = j = 0; i < s; i += 16) {
            a = h;

            for (; j < 64;
                   a = [
                       d = a[3],
                       (
                           b +
                           ((d =
                                   a[0] +
                                   [
                                       b & c | ~b & d,
                                       d & b | ~d & c,
                                       b ^ c ^ d,
                                       c ^ (b | ~d)
                                   ][a = j >> 4] +
                                   k[j] +
                                   ~~words[i | [
                                       j,
                                       5 * j + 1,
                                       3 * j + 5,
                                       7 * j
                                   ][a] & 15]
                           ) << (a = [
                               7, 12, 17, 22,
                               5, 9, 14, 20,
                               4, 11, 16, 23,
                               6, 10, 15, 21
                           ][4 * a + j++ % 4]) | d >>> -a)
                       ),
                       b,
                       c
                   ]
            ) {
                b = a[1] | 0;
                c = a[2];
            }

            // See "Integer safety" in notes
            for (j = 4; j;) h[--j] += a[j];

            // j === 0
        }

        for (s = ''; j < 32;) {
            s += ((h[j >> 3] >> ((1 ^ j++) * 4)) & 15).toString(16);
            // s += ((h[j >> 3] >> (4 ^ 4 * j++)) & 15).toString(16);
        }

        return s;
    },
    getProfileImage(user) {
        if (user.userData) {
            if( user.userData.picture ) {
                return _app_.config.UPLOAD_URL + '/' + user.userData.picture._id
            }
        }
        return 'https://gravatar.com/avatar/' + Util.md5(user.userData ? user.userData.email:'') + '?s=50&r=pg&d=mp'
    },
    getMediaSrc(media, src) {
        return src ? src : (media.src ? media.src : _app_.config.UPLOAD_URL + '/' + media._id)
    },
    getImageObject(raw) {
        if (!raw) {
            //TODO replace image placeholder
            return {
                src: 'https://www.savory.global/wp-content/uploads/2018/07/placeholder.png',
                alt: 'Placeholder image'
            }
        }

        let image = raw.constructor === String ? JSON.parse(raw) : raw
        if (image.constructor === Array) {
            image = image[0]
        }
        const data = {alt: image.name}
        if (!image.src) {
            data.src = _app_.config.UPLOAD_URL + '/' + image._id
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
    propertyByPath(path, obj) {
        return path.split('.').reduce((res, prop) => res[prop], obj)
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
        if (newObj !== prevObj) return true
        if (!newObj && !prevObj) return false
        for (const key in newObj) {
            if (newObj[key] !== prevObj[key]) return true
        }
        return false
    }
}
export default Util
