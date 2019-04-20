const _t = (key, replacements) => {
    let str = window._app_.tr[key] || key
    if (replacements) {
        str = str.replace(/%(\w+)%/g, function (all, key) {
            return replacements[key] !== undefined ? replacements[key] : all
        })
    }
    return str
}

export default _t