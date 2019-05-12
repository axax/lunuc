const _t = function (key, replacements) {
    let str
    console.log(this)
    if (this && this.tr && this.tr[key]) {
        str = this.tr[key]
    } else {
        str = window._app_.tr[key] || key
    }
    if (replacements) {
        str = str.replace(/%(\w+)%/g, function (all, key) {
            return replacements[key] !== undefined ? replacements[key] : all
        })
    }
    return str
}

export default _t