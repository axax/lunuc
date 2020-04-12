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
    }
}

export default DomUtilAdmin
