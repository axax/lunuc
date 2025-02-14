export const _t = function (key, replacements, defaultValue) {
    if(key && key.constructor === Object){
        // for {"de":"Title"}
        return key[_app_.lang] || key[_app_.config.DEFAULT_LANGUAGE] || ''
    }
    let str
    if (this && this.tr && this.tr[key]) {
        // local translations
        str = this.tr[key]
    } else {
        // global translations
        str = _app_.tr[key] || defaultValue || key
    }
    if (replacements) {
        str = str.replace(/%(\w+)%/g, (all, key) => {
            return replacements[key] !== undefined ? replacements[key] : all
        })
    }
    return str
}

const hasRegisteredMap = {}
export const registerTrs = (trans, registerId) => {
    if(registerId ){
        if(hasRegisteredMap[registerId]) {
            // only register once
            return
        }
        hasRegisteredMap[registerId] = true
    }
    let lang
    if(_app_.user && _app_.user.language){
        lang = _app_.user.language
    }else{
        lang = _app_.lang
    }

    if(trans[lang]){
        Object.keys(trans[lang]).forEach(t=>{
            _app_.tr[t] = trans[lang][t]
        })
    }
}
