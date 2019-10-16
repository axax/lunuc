/**
 * Html dom helper methods
 */
const DomUtil = {
    removeElements(selector) {
        const addedElements = document.querySelectorAll(selector)
        if (addedElements) {
            for (let i = 0; i < addedElements.length; ++i) {
                const ele = addedElements[i]
                ele.parentNode.removeChild(ele)
            }
        }
    },
    addStyle(href, attrs) {
        const style = DomUtil.createAndAddTag('link', 'head', {type: 'text/css', rel: 'stylesheet', href, ...attrs})
    },
    addScript(src, attrs) {
        const script = DomUtil.createAndAddTag('script', 'head', {
            src, asyn: true, defer: true, onload: function () {
                script.setAttribute('loaded', true)
            }, ...attrs
        })
    },
    createAndAddTag(name, target, attrs) {
        if (_app_.ssr) {
            //TODO: implmentation for server side rendering
            return
        }
        let tag
        if (attrs.id) {
            tag = document.getElementById(attrs.id)
        }
        if (!tag)
            tag = document.createElement(name)
        for (const key of Object.keys(attrs)) {
            if (key === 'data') {
                for (const dataKey of Object.keys(attrs[key])) {
                    tag.dataset[dataKey] = attrs[key][dataKey]
                }

            }
            if (key === 'style' && attrs[key].constructor === Object) {
                tag[key] = DomUtil.styleObjectToString(attrs[key])
            } else if (attrs[key])
                tag[key] = attrs[key]
        }
        document.getElementsByTagName(target)[0].appendChild(tag)
        return tag
    },
    styleObjectToString(style) {
        const styleString = (
            Object.entries(style).reduce((styleString, [propName, propValue]) => {
                return `${styleString}${propName}:${propValue};`
            }, '')
        )
        return styleString
    },
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
        var xPos = 0
        var yPos = 0

        while (el) {
            if (el.tagName == "BODY") {
                // deal with browser quirks with body/window/document and page scroll
                var xScroll = el.scrollLeft || document.documentElement.scrollLeft
                var yScroll = el.scrollTop || document.documentElement.scrollTop

                xPos += (el.offsetLeft - xScroll + el.clientLeft)
                yPos += (el.offsetTop - yScroll + el.clientTop)
            } else {
                // for all other non-BODY elements
                xPos += (el.offsetLeft - el.scrollLeft + el.clientLeft)
                yPos += (el.offsetTop - el.scrollTop + el.clientTop)
            }

            el = el.offsetParent
        }
        return {
            left: xPos,
            top: yPos
        }
    },
    toES5: (code) => {
        if (typeof window !== 'undefined' && window.Babel) {
            return Babel.transform(code, {
                parserOpts: {
                    allowReturnOutsideFunction: true,
                },
                presets: [
                    ['es2015', {modules: false}]
                ]
            }).code
        }
        return code
    }
}

export default DomUtil
