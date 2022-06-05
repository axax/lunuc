/**
 * Html dom helper methods (used when logged in only)
 */
const DomUtilAdmin = {
    setAttrForSelector(selector, attrs) {
        const tags = document.querySelectorAll(selector)


        if (tags) {
            const keys = Object.keys(attrs)
            for (let i = 0; i < tags.length; ++i) {
                const tag = tags[i]
                for (let j = 0; j < keys.length; ++j) {
                    const key = keys[j]
                    if (attrs[key])
                        tag[key] = attrs[key]
                }
            }
        }
    },
    elemOffset(el) {
        const {left, top} = el.getBoundingClientRect()
        return {
            left,
            top
        }
    },
    findProperties: (json, key, accumulator = [], parent, index) => {
        if (json && (json.constructor === Object || json.constructor === Array)) {
            const keys = json.constructor === Object ? Object.keys(json) : json
            for (let i = 0; i < keys.length; i++) {
                if (keys[i].constructor === Object) {
                    DomUtilAdmin.findProperties(keys[i], key, accumulator, json, i)
                } else if (key === keys[i]) {
                    accumulator.push({element: json, parent, index})
                } else {
                    DomUtilAdmin.findProperties(json[keys[i]], key, accumulator, json)
                }
            }
        }
        return accumulator
    }
}

export default DomUtilAdmin
