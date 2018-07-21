const Util = {
    escapeDoubleQuotes: (str) => {
        if (str && str.constructor === String) {
            return str.replace(/"/g, '\\"')
        }
        return str
    },
    escapeForJson: (str) => {
        return str.replace(/[\\\b\\\f\\\n\\\r\\\t\"\\]/g, "\\$&")
    },
    /* don't use arrow function use regular function instead. otherwise bind cannot be applied */
    tryCatch: function (str) {
        try {
            return eval(str)
        } catch (e) {
            // console.log(e)
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
    extractQueryParams: query => {
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
                else
                    b[p[0]] = decodeURIComponent(p[1].replace(/\+/g, ' '))
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
    }
}
export default Util