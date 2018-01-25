const Util = {
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
    escapeHtml: (str) => {
        const entityMap = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
            '/': '&#x2F;',
            '`': '&#x60;',
            '=': '&#x3D;'
        }
        return String(str).replace(/[&<>"'`=\/]/g, function (s) {
            return entityMap[s];
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

        var b = {};
        for (var i = 0; i < a.length; ++i) {
            var p = a[i].split('=', 2)
            if (p.length == 1)
                b[p[0]] = ""
            else
                b[p[0]] = decodeURIComponent(p[1].replace(/\+/g, " "))
        }
        return b
    }
}
export default Util