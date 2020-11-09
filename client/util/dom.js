/**
 * Html dom helper methods
 */
import {propertyByPath} from './json'

const DomUtil = {
    removeElements(selector, butIds, container = document) {
        const addedElements = container.querySelectorAll(selector)
        if (addedElements) {
            for (let i = 0; i < addedElements.length; ++i) {
                const ele = addedElements[i]
                if (!butIds || butIds.indexOf(ele.id) < 0) {
                    ele.parentNode.removeChild(ele)
                }
            }
        }
    },
    addStyle(href, attrs, opts) {
        const style = DomUtil.createAndAddTag('link', 'head', {
            type: 'text/css',
            rel: 'stylesheet',
            href, ...attrs
        }, opts)
    },
    addScript(src, attrs, opts) {
        DomUtil.createAndAddTag('script', 'head', {
            src, async: true, defer: true, ...attrs,
            onload: (e) => {
                if(e && e.target) {
                    e.target.setAttribute('loaded', true)
                }
                if(attrs && attrs.onload){
                    attrs.onload(e)
                }
            }
        }, opts)
    },
    createAndAddTag(name, target, attrs, opts) {
        if (_app_.ssr) {
            //TODO: implmentation for server side rendering
            return
        }
        let tag
        if (attrs.id) {
            tag = document.getElementById(attrs.id)
        }
        if (!tag) {
            tag = document.createElement(name)
        } else if (opts && opts.ignoreIfExist) {
            if (attrs.onload) {
                attrs.onload()
            }
            return
        }
        for (const key of Object.keys(attrs)) {
            if (key === 'data') {
                for (const dataKey of Object.keys(attrs[key])) {
                    if (tag.dataset) {
                        tag.dataset[dataKey] = attrs[key][dataKey]
                    } else {
                        tag.setAttribute('data-' + dataKey.replace(/([A-Z])/g, "-$1").toLowerCase(), attrs[key][dataKey])
                    }
                }
            } else if (key === 'style' && attrs[key].constructor === Object) {
                tag[key] = DomUtil.styleObjectToString(attrs[key])
            } else if (attrs[key]) {
                if (key === 'innerHTML' || key === 'innerText' || key === 'onload' || key === 'textContent') {
                    tag[key] = attrs[key]
                } else {
                    tag.setAttribute(key, attrs[key])
                }
            }
        }
        document[target].appendChild(tag)
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
    toES5: (code) => {
        if (typeof window !== 'undefined' && window.Babel) {
            if (code.length < 500 && DomUtil.es5Cache && DomUtil.es5Cache[code]) {
                return DomUtil.es5Cache[code]
            }
            const startTime = new Date().getTime()
            const result = Babel.transform(code, {
                sourceMap: false,
                highlightCode: false,
                sourceType: 'script',
                parserOpts: {
                    allowReturnOutsideFunction: true
                },
                presets: [
                    ['es2015', {modules: false, loose: true}]
                ]
            })

            if (code.length < 500) {
                if (!DomUtil.es5Cache) {
                    DomUtil.es5Cache = {}
                }
                DomUtil.es5Cache[code] = result.code
            }
            console.log(`Js to es5 in ${new Date().getTime() - startTime}ms for ${code.substring(0, 60)}...`)
            return result.code
        }
        return code
    },
    waitForElement: (selector) => {
        return new Promise(resolve => {
            if (document.querySelector(selector)) {
                return resolve(document.querySelector(selector))
            }

            const observer = new MutationObserver(mutations => {
                if (document.querySelector(selector)) {
                    resolve(document.querySelector(selector))
                    observer.disconnect()
                }
            })

            observer.observe(document.body, {
                childList: true,
                subtree: true
            })
        })
    },
    waitForVariable: (name, obj = window) => {
        return new Promise(resolve => {

            const check = ()=>{
                const value = propertyByPath(name, obj )
                if(value){
                    resolve(value)
                }else {
                    setTimeout(check, 100)
                }
            }
            check()
        })
    }
}

export default DomUtil
