const Util = {
    escapeDoubleQuotes: (str) => {
        if (str && str.constructor === String) {
            return str.replace(/"/g, '\\"')
        }
        return str
    },
    escapeForJson: (str, removeBreaks) => {
        if (!str) return ''

        let replace = '(?:\r\n|\r|\n'
        if (removeBreaks) {
            // use remove breaks for html
            replace += '|\t'
        }
        replace += ')'

        return str.replace(new RegExp(replace, 'g'), removeBreaks ? '' : '\\n').replace(/[\\\b\\\f\\\t\"\\]/g, '\\$&')
    },
    /* don't use arrow function use regular function instead. otherwise bind cannot be applied */
    tryCatch: function (str) {
        const data = this.data
        try {
            return eval(str)
        } catch (e) {
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
        if (objectId.indexOf('#') === 0) {
            // this is only a tmp id / timestemp
            return parseInt(objectId.substring(1))
        }

        return new Date(parseInt(objectId.substring(0, 8), 16) * 1000)
    },
    formattedDateFromObjectId: (objectId) => {
        if (objectId === 0) {
            return new Intl.DateTimeFormat().format(new Date())
        }
        return new Intl.DateTimeFormat().format(Util.dateFromObjectId(objectId))
    },
    formattedDatetimeFromObjectId: (objectId) => {

        const options = {
            hour: 'numeric', minute: 'numeric', second: 'numeric',
            timeZoneName: 'short'
        }
        if (objectId === 0) {
            return new Intl.DateTimeFormat().format(new Date(), options)
        }
        return new Intl.DateTimeFormat().format(Util.dateFromObjectId(objectId), options)
    },
    formattedDatetime(stamp){
        if (!stamp) return ''
        if (typeof stamp === 'string') {
            stamp = parseFloat(stamp);
        }
        return new Date(stamp).toLocaleString()
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
    isOnServer: () => {
        return !(
            typeof window !== 'undefined' &&
            window.document &&
            window.document.createElement
        )
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
    parseFilter: filter => {
        const parts = {}, rest = []
        let restString = ''

        if (filter) {
            let operator = 'or'
            filter.split(' ').forEach(i => {

                if (i === '&&') {
                    operator = 'and'
                } else {
                    const q = i.split(/=|:/)
                    if (q.length > 1) {
                        if (parts[q[0]]) {
                            parts[q[0]] = [parts[q[0]]]
                            parts[q[0]].push({value: q[1], operator})
                        } else {
                            parts[q[0]] = {value: q[1], operator}
                        }

                    } else {
                        rest.push({value: q[0], operator})
                        if (restString !== '') restString += ' '
                        restString += (operator === 'and' ? ' and ' : '') + q[0]
                    }
                    operator = 'or'
                }
            })
        }
        return {parts, rest, restString}
    },
    addStyle(url) {
        const link = document.createElement('link')
        link.type = 'text/css'
        link.rel = 'stylesheet'
        link.href = url
        document.head.appendChild(link)
    },
    addScript(url) {
        const script = document.createElement('script')
        script.src = url
        document.head.appendChild(script)
    },
    hasCapability(user, capa){
        const capabilities = (user && user.userData && user.userData.role && user.userData.role.capabilities) || []
        return capabilities.indexOf(capa) >= 0
    },
    getComponentByKey(key, obj){
        if (!obj) return
        const keyParts = key.split('.')
        // the root is always 0 so remove it
        keyParts.shift()

        let cur = obj
        for (let i = 0; i < keyParts.length; i++) {
            if (i > 0 && keyParts[i - 1] === '$loop') {
                continue
            }
            const part = keyParts[i]
            if (cur.constructor === Object && cur.c) cur = cur.c
            if (cur.constructor === Object && !isNaN(part)) cur = [cur]

            if (!cur[part]) {
                console.warn('Something is wrong with the key: ' + key, part)
                return null
            }
            cur = cur[part]
        }
        return cur
    },
    formatBytes(bytes, decimals) {
        if (bytes == 0) return '0 Bytes';
        var k = 1024,
            dm = decimals || 2,
            sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
            i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }
}
export default Util