/**
 * Html dom helper methods
 */
const DomUtil = {
    removeElements(selector, butIds) {
        const addedElements = document.querySelectorAll(selector)
        if (addedElements) {
            for (let i = 0; i < addedElements.length; ++i) {
                const ele = addedElements[i]
                if (!butIds || butIds.indexOf(ele.id) < 0) {
                    ele.parentNode.removeChild(ele)
                }
            }
        }
    },
    addStyle(href, attrs) {
        const style = DomUtil.createAndAddTag('link', 'head', {type: 'text/css', rel: 'stylesheet', href, ...attrs})
    },
    addScript(src, attrs) {
        const script = DomUtil.createAndAddTag('script', 'head', {
            src, asyn: true, defer: true,
            onload: function () {
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
                    if(tag.dataset) {
                        tag.dataset[dataKey] = attrs[key][dataKey]
                    }else{
                        tag.setAttribute('data-'+dataKey.replace(/([A-Z])/g, "-$1").toLowerCase(), attrs[key][dataKey])
                    }
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
       const {left, top} = el.getBoundingClientRect()
        return {
            left,
            top
        }
    },
    toES5: (code) => {
        if (typeof window !== 'undefined' && window.Babel) {
            if (code.length < 500 && DomUtil.es5Cache && DomUtil.es5Cache[code]) {
                return DomUtil.es5Cache[code]
            }
            const startTime = new Date().getTime()
            const result = Babel.transform(code, {
                sourceMap:false,
                highlightCode:false,
                sourceType: 'script',
                parserOpts: {
                    allowReturnOutsideFunction: true
                },
                presets: [
                    ['es2015', {modules: false}]
                ]
            })

            if (code.length < 500) {
                if (!DomUtil.es5Cache) {
                    DomUtil.es5Cache = {}
                }
                DomUtil.es5Cache[code] = result.code
            }
            console.log(`Js to es5 in ${new Date().getTime() - startTime}ms for ${code.substring(0, 20)}...`)
            return result.code
        }
        return code
    }
}

export default DomUtil
