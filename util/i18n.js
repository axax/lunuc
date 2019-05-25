const _t = function (key, replacements) {
    let str
    if (this && this.tr && this.tr[key]) {
        // local translations
        str = this.tr[key]
    } else {
        // global translations
        str = _app_.tr[key] || key
    }
    if (replacements) {
        str = str.replace(/%(\w+)%/g, function (all, key) {
            return replacements[key] !== undefined ? replacements[key] : all
        })
    }
    return str
}

export default _t