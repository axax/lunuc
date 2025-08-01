/**
 * Html dom helper methods
 */
import {propertyByPath} from './json.mjs'

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
        DomUtil.createAndAddTag('link', 'head', {
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
    noIndexNoFollow(){
        DomUtil.createAndAddTag('meta', 'head', {
            name: 'robots',
            content: 'noindex,nofollow',
            id: 'noIndexNoFollow'
        })
    },
    createAndAddTag(name, target, attrs, opts) {
        if (_app_.ssr) {
            //TODO: implmentation for server side rendering
            return
        }
        const doc = opts && opts.document ? opts.document : document
        let tag
        if (attrs.id) {
            tag = doc.getElementById(attrs.id)
        }
        if (!tag) {
            tag = doc.createElement(name)
        } else if (opts && opts.ignoreIfExist) {
            if (attrs.onload) {
                attrs.onload()
            }
            return
        }
        for (const key of Object.keys(attrs)) {
            if (key === 'data') {
                for (const dataKey of Object.keys(attrs[key])) {
                    const value = attrs[key][dataKey]
                    //if (tag.dataset) {
                    if(value===undefined){
                        delete tag.dataset[dataKey]
                    }else {
                        tag.dataset[dataKey] = value
                    }
                    /*} else {
                        tag.setAttribute('data-' + dataKey.replace(/([A-Z])/g, "-$1").toLowerCase(), attrs[key][dataKey])
                    }*/
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
        doc[target].appendChild(tag)
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
            console.log(`Js to es5 in ${new Date().getTime() - startTime}ms for ${code.substring(0, 60)}...`)
            return result.code
        }
        return code
    },
    waitForElement: (selector, options) => {
        return new Promise((resolve, reject) => {

            try {
                const isAll = options && options.all
                const doc = options && options.document ? options.document : document
                const fn = isAll ? doc.querySelectorAll.bind(doc) : doc.querySelector.bind(doc)
                const el = fn(selector)
                if (el && (!isAll || el.length>0)) {
                    return resolve(el)
                }
                const timer = options && options.timeout && setTimeout(() => {
                    observer.disconnect()
                    console.log('waitForElement timeout')
                    if(options.resolveOnTimeout) {
                        resolve()
                    }else{
                        reject(new Error('waitForElement timeout'))
                    }
                }, options.timeout)

                const observer = new MutationObserver(mutations => {
                    const el = fn(selector)
                    if (el && (!isAll || el.length>0)) {
                        clearTimeout(timer)

                        resolve(el)
                        observer.disconnect()
                    }
                })

                if(options && options.callback){
                    observer.callback = options.callback({observer})
                }

                observer.observe(doc, {
                    childList: true,
                    subtree: true
                })
            }catch (e) {
                console.log(e)
                reject(e)
            }
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
