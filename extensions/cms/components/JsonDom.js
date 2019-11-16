import React from 'react'
import ReactDOM from 'react-dom'
import PropTypes from 'prop-types'
import Hook from 'util/hook'
import _t from 'util/i18n'
import Util from 'client/util'
import {getComponentByKey} from '../util/jsonDomUtil'
import DomUtil from 'client/util/dom'
import Async from 'client/components/Async'
import CmsViewContainer from '../containers/CmsViewContainer'
import {getKeyValueFromLS} from 'client/util/keyvalue'
import {
    Col,
    Row,
} from 'ui'
import SmartImage from 'client/components/SmartImage'
import {Link} from 'react-router-dom'
import JsonDomInput from './JsonDomInput'
import {deepMergeConcatArrays} from 'util/deepMerge'
import {classNameByPath} from '../util/jsonDomUtil'
import {preprocessCss} from '../util/cssPreprocessor'
import {parseStyles} from 'client/util/style'

const JsonDomHelper = (props) => <Async {...props}
                                        load={import(/* webpackChunkName: "admin" */ './JsonDomHelper')}/>

const ContentEditable = (props) => <Async {...props}
                                          load={import(/* webpackChunkName: "admin" */ '../../../client/components/ContentEditable')}/>

const FileDrop = (props) => <Async {...props}
                                   load={import(/* webpackChunkName: "admin" */ '../../../client/components/FileDrop')}/>

const Print = (props) => <Async {...props}
                                load={import(/* webpackChunkName: "extra" */ '../../../client/components/Print')}/>


const MarkDown = (props) => <Async {...props}
                                   load={import(/* webpackChunkName: "extra" */ '../../../client/components/MarkDown')}/>

const DrawerLayout = (props) => <Async {...props} expose="ResponsiveDrawerLayout"
                                       load={import(/* webpackChunkName: "admin" */ '../../../gensrc/ui/admin')}/>

const TypesContainer = (props) => <Async {...props}
                                         load={import(/* webpackChunkName: "admin" */ '../../../client/containers/TypesContainer')}/>


function waitUntilVisible({jsonDom, key, eleType, eleProps, c, $c, scope}) {
    // ...and returns another component...
    return class extends React.Component {


        state = {isVisible: false}

        constructor(props) {
            super(props)
        }

        componentDidMount() {
            this.addIntersectionObserver()
        }

        render() {
            if (!this.state.isVisible && !!window.IntersectionObserver) {
                return <div _key={key} data-wait-visible={jsonDom.instanceId}>...</div>
            } else {
                return React.createElement(
                    eleType,
                    eleProps,
                    ($c ? null : jsonDom.parseRec(c, key, scope))
                )
            }
        }

        addIntersectionObserver() {
            const ele = document.querySelector(`[_key='${key}']`)
            if (ele) {
                let observer = new IntersectionObserver((entries, observer) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            observer.unobserve(entry.target)
                            this.setState({isVisible: true})

                        }
                    })
                }, {rootMargin: '-100px -100px -100px -100px'})
                observer.observe(ele)
            }
        }

    }
}

class JsonDom extends React.Component {

    /* Events that are listened to */
    static events = ['Click', 'KeyDown', 'KeyUp', 'Change', 'Submit', 'Success', 'ContextMenu', 'CustomEvent', 'FileContent', 'Files']

    /*
    * Default components
    * new components can be added with the JsonDom hook
    * */
    static components = {
        /* Material Design / admin Component */
        'DrawerLayout': DrawerLayout,
        'TypesContainer': (props) => <TypesContainer noLayout={true} title={false}
                                                     baseUrl={location.pathname} {...props}/>,

        /* Default UI Implementation Components */
        'Col': Col,
        'Row': Row,

        /* Other components */
        'FileDrop': {component: FileDrop, label: 'File Drop'},
        'MarkDown': {component: MarkDown, label: 'Markdown parser'},
        'SmartImage': {component: SmartImage, label: 'Smart Image (lazy load, error handing...)'},
        'Print': {component: Print, label: 'Printable area'},
        'input': JsonDomInput,
        'textarea': (props) => <JsonDomInput textarea={true} {...props}/>,
        'Link': ({to, href, target, gotop, onClick, ...rest}) => {
            const url = to || href || '', newTarget = target && target !== 'undefined' ? target : '_self',
                rel = target === '_blank' ? 'noopener' : ''

            if (url.startsWith('https://') || url.startsWith('http://')) {
                return <a href={url} target={newTarget} rel={rel} onClick={(e) => {

                    if (onClick) {
                        onClick(e)
                    }
                }
                } {...rest}/>
            } else {
                return <Link target={newTarget} rel={rel} onClick={(e) => {

                    if (!url) {
                        e.preventDefault()
                        return false
                    }

                    if (gotop) {
                        window.scrollTo({top: 0})
                    }

                    if (onClick) {
                        onClick(e)
                    }

                }} to={url} {...rest}/>
            }
        },
        'Cms': ({props, _this, ...rest}) => {
            if (!rest.id) {
                console.warn(`There is no id set for included Cms Component ${rest.slug}`, props)
            }
            return <CmsViewContainer key={rest.id}
                                     _props={props}
                                     _parentRef={_this}
                                     fetchPolicy="cache-first"
                                     aboutToChange={_this.props.aboutToChange}
                                     dynamic={true} {...rest}/>
        },
        'ContentEditable': ({_this, _key, ...props}) => <ContentEditable
            onChange={(v) => _this.emitChange(_key, v)} {...props} />
    }

    // Makes sure that the hook is only called once on the first instantiation of this class
    static callHock = true

    // This is a counter each instance of JsonDom get a unique number
    static instanceCounter = 0

    // Is the parsed version of the resolved data
    resolvedDataJson = undefined

    // Data bindings on form input, textarea, and select elements
    bindings = {}

    // Is set to true when there is an error
    hasError = false

    extendedComponents = {}
    json = null
    jsonRaw = null
    _inHtmlComponents = []
    scope = {}
    updateScope = true
    parseError = null
    runScript = true
    scriptResult = null
    componentRefs = {} // this is the object with references to elements with identifier
    jsOnStack = {}


    constructor(props) {
        super(props)
        JsonDom.instanceCounter++
        this.instanceId = JsonDom.instanceCounter
        if (props.subscriptionCallback) {
            props.subscriptionCallback(this.onSubscription.bind(this))
        }

        /* HOOK */
        if (JsonDom.callHock) {
            // Call only once on the first instantiation of JsonDom
            JsonDom.callHock = false

            // In this hook extensions can add custom components
            Hook.call('JsonDom', JsonDom)
        }

        this.addParentRef(props)
    }

    shouldComponentUpdate(props, state) {
        const resolvedDataChanged = this.props.resolvedData !== props.resolvedData

        const locationChanged = this.props.location.search !== props.location.search ||
            this.props.location.hash !== props.location.hash

        const scriptChanged = (this.props.script !== props.script)
        const resourcesChanged = (this.props.resources !== props.resources)
        const templateChanged = !props.template || (this.props.template !== props.template)

        const propsChanged = this.props._props !== props._props
        const slugChanged = this.props.slug !== props.slug

        const updateIsNeeded = resolvedDataChanged ||
            locationChanged ||
            scriptChanged ||
            templateChanged ||
            resourcesChanged ||
            propsChanged ||
            slugChanged ||
            props.children !== this.props.children ||
            this.props.user !== props.user ||
            this.props.renewing !== props.renewing ||
            this.props.inlineEditor !== props.inlineEditor

        if (updateIsNeeded) {

            // set error to false before render
            this.hasError = false

            // reset parsing error
            this.parseError = null

            if (resolvedDataChanged) {
                // renew resolved data json
                this.resolvedDataJson = undefined
                this.json = null

            }

            if (slugChanged || locationChanged || templateChanged || propsChanged || scriptChanged) {
                this.json = this.jsonRaw = null
                this.updateScope = true
            }

            if (slugChanged || scriptChanged || this.runScript) {
                this.removeAddedDomElements()
                this.scriptResult = null
                this.runScript = true
            }

            if (resourcesChanged) {
                this.checkResources()
            }


            this.addParentRef(props)

            return true
        }
        return false
    }

    componentDidCatch() {
        this.hasError = true
        this.forceUpdate()
    }

    componentDidMount() {
        this._ismounted = true
        this.node = ReactDOM.findDOMNode(this)
        this.runJsEvent('mount', true)
        this.checkResources()
        this._historyUnlisten = this.props.history.listen(() => {
            const before = {pathname: this.scope.pathname, params: this.scope.params, hashParams: this.scope.params}
            this.addLocationToScope()
            this.runJsEvent('urlchange', false, before)
        })
        this.moveInHtmlComponents()
    }

    componentWillUnmount() {
        this.runJsEvent('unmount')
        this._historyUnlisten()
        this._ismounted = false
        this.removeAddedDomElements()
        this.json = this.jsonRaw = this.componentRefs = null
        if (this.node && this.node.oriParent) {
            this.node.oriParent.appendChild(this.node)
        }
    }

    // is called after render
    componentDidUpdate(props, state, snapshot) {
        this._ismounted = true
        this.runJsEvent('update', true)
        this.moveInHtmlComponents()
    }

    render() {
        const {dynamic, template, script, resolvedData, className, _props, _key, renewing} = this.props
        if (!template) {
            console.warn('Template is missing.', this.props)
            return null
        }

        if (this.hasError) {
            return <strong>There is something wrong with one of the components defined in the json content. See
                console.log in the browser for more detail.</strong>
        }
        const startTime = (new Date()).getTime(),
            scope = this.getScope(this.props)

        let resolveDataError

        if (this.resolvedDataJson === undefined) {
            try {

                if (resolvedData.indexOf('${') >= 0) {
                    this.resolvedDataJson = JSON.parse(new Function(`const Util = this.Util; const {${Object.keys(scope).join(',')}} = this.scope; return \`${resolvedData.replace(/\\/g, '\\\\')}\``).call({
                        scope,
                        Util
                    }))
                } else {
                    this.resolvedDataJson = JSON.parse(resolvedData)
                }

                if (this.resolvedDataJson.error) {
                    resolveDataError = this.resolvedDataJson.error
                }
            } catch (e) {
                resolveDataError = e.message
                console.log(resolvedData)
            }

            if (resolveDataError) {
                return <div>Error in data resolver: <strong>{resolveDataError}</strong></div>
            }
        }
        scope.data = this.resolvedDataJson
        scope.props = _props
        scope.renewing = renewing

        // find root parent
        let root = this, parent = this.props._parentRef
        while (root.props._parentRef) {
            root = root.props._parentRef
        }
        scope.root = root
        scope.parent = parent

        if (this.runScript && script) {
            this.runScript = false
            this.runJsEvent('beforerunscript', false, scope)
            try {
                this.jsOnStack = {}
                this.scriptResult = new Function(DomUtil.toES5(`
                const   __this=this._this
                const {serverMethod, on, setLocal, getLocal, refresh, getComponent, addMetaTag, setStyle, fetchMore} = __this
                const {history, clientQuery, setKeyValue} = __this.props
                const {scope, getKeyValueFromLS, parent, root, Util, DomUtil} = this
                const _t = this._t.bind(scope.data),forceUpdate = refresh
                ${script}`)).call({
                    _this: this,
                    scope,
                    Util,
                    DomUtil,
                    _t,
                    getKeyValueFromLS,
                    root,
                    parent
                })
            } catch (e) {
                console.error(e)
                return <div>Error in the script: <strong>{e.message}</strong></div>
            }
            scope.script = this.scriptResult || {}
        }
        if (!this.runJsEvent('beforerender', false, scope)) {
            return <div>Error in beforerender event. See details in console log</div>
        }

        let content = this.parseRec(this.getJson(this.props), _key ? _key + '-0' : 0, scope, true)

        if (content && this._inHtmlComponents.length > 0) {
            content = [content, <div key={content.key + '_inHtmlComponents'}>{this._inHtmlComponents}</div>]
        }

        console.log(`render ${this.constructor.name} for ${scope.page.slug} in ${((new Date()).getTime() - startTime)}ms`)
        if (this.parseError) {
            return <div>Error in the template: <strong>{this.parseError.message}</strong></div>
        } else {
            if (dynamic) {
                /* if (this.props.editMode) {
                     return <div _key={_key}>{content}</div>
                 }*/
                return content
            } else {
                return <div className={classNameByPath(scope.page.slug, className)}>{content}</div>
            }
        }
    }

    checkResources() {
        // check if all scripts are loaded
        let allloaded = true, counter = 0
        const resources = document.querySelectorAll(`script[data-cms-view="true"]`)
        if (resources) {
            for (let i = 0; i < resources.length; ++i) {
                const resource = resources[i]
                if (!resource.getAttribute('loaded')) {
                    allloaded = false
                    counter++
                    resource.addEventListener('load', () => {
                        counter--
                        if (counter === 0) {
                            this.runJsEvent('resourcesready')
                        }
                    })
                }
            }
        }
        if (allloaded) {
            this.runJsEvent('resourcesready', true)
        }
    }

    addParentRef(props) {
        const {id, _parentRef} = props
        if (_parentRef && id) {
            props._parentRef.componentRefs[id] = this
        }
    }

    removeAddedDomElements() {
        DomUtil.removeElements(`[data-json-dom-id="${this.instanceId}"]`)
    }

    handleBindingChange(cb, event, value) {
        const target = event.target
        this.bindings[target.name] = value || target.value
        if (cb)
            cb.bind(this)(event)
    }

    onSubscription(data) {
        this.runJsEvent('subscription', false, data)
    }

    emitChange(key, value) {
        const {onChange} = this.props

        if (!onChange)
            return

        const jsonClone = this.getJsonRaw(this.props)
        const o = getComponentByKey(key, jsonClone)
        if (o && o.c && o.c.constructor === String) {
            o.c = value
            onChange(jsonClone)
        }
    }


    emitJsonError(e) {
        const {onError} = this.props

        this.parseError = e

        if (!onError)
            return

        onError(e)
    }

    parseRec(a, rootKey, scope, initial) {
        if (!a) return null
        if (a.constructor === String) return a
        if (a.constructor === Object) return this.parseRec([a], rootKey, scope)
        if (a.constructor !== Array) return ''
        let h = []
        a.forEach((item, aIdx) => {

            if (!item) return

            const {t, p, c, $c, $loop, $if, $ifexist, x, $wait, $for} = item
            /*
             t = type
             c = children
             $c = children as html
             $if = condition (only parse if condition is fullfilled)
             p = prop
             */
            if( $ifexist ){
                try {
                    if(Util.propertyByPath($ifexist, scope) === undefined){
                        return
                    }
                }catch (e) {
                    return
                }
            }

            if ($if) {
                // check condition --> slower than to check with $ifexist
                try {
                    const tpl = new Function(DomUtil.toES5('const {' + Object.keys(scope).join(',') + '} = this.scope;return ' + $if))
                    if (!tpl.call({scope})) {
                        return
                    }
                } catch (e) {
                    console.log(e, scope)
                    return
                }
            }

            // extend type
            if (x && x.n) {
                const extComp = this.extendedComponents[x.t]
                if (!extComp) {
                    let comp = JsonDom.components[x.t]
                    if (comp) {
                        if (comp.constructor === Object) {
                            comp = comp.component
                        }
                        this.extendedComponents[x.n] = (props) => {
                            return comp({...x.p, ...props})
                        }
                    }
                }
            }

            // loop is deprecated. Use "for" instead, as it is better performance-wise
            let loopOrFor
            if( $for ){
                loopOrFor = $for
            }else{
                loopOrFor = $loop
            }

            if (loopOrFor) {
                const {$d, d, c} = loopOrFor
                let data
                if ($d) {
                    try {
                        // get data from scope by path (foo.bar)
                        data = Util.propertyByPath($d,scope)
                    } catch (e) {
                        this.emitJsonError(e)
                    }
                } else {
                    if (d && d.constructor === String) {
                        try {
                            data = Function(DomUtil.toES5(`const {${Object.keys(scope).join(',')}} = this.scope;const Util = this.Util;return ${d}`)).call({
                                scope,
                                Util
                            })
                        } catch (e) {
                            console.log(e, d)
                            return 'Error in parseRec (in data source for loop): ' + e.message
                        }
                    } else {
                        data = d
                    }
                }
                if (!data) return ''
                if (data.constructor === Object) {
                    data = Object.keys(data).map((k) => {
                        return {key: k, value: data[k]}
                    })
                }

                if (data.constructor !== Array) return ''
                let {s} = loopOrFor
                if (!s) s = 'loop'
                /*
                 d = data in loop
                 $d = data (json as string) in loop
                 c = children in loop
                 s = scope in loop to access data
                 */
                try {
                    const re = new RegExp('\\$\\.' + s + '{', 'g'),
                        re2 = new RegExp('"' + s + '###', 'g'),
                        re3 = new RegExp('###' + s + '"', 'g')
                    const cStr = JSON.stringify(c).replace(re, '${') /* $.loop{ --> ${ */
                    /* "$.loop" --> ${JSON.stringify(this.loop)} the whole loop item */
                        .replace('"$.' + s + '"', '${JSON.stringify(this.' + s + ')}')
                        .replace(re2, '').replace(re3, '')

                    let tpl

                    if ( $for ) {
                        tpl = new Function(DomUtil.toES5(`const ${s} = this.${s},
                                                    Util = this.Util,
                                                    _i = Util.tryCatch.bind(this),
                                                    _t = this._t.bind(this.scope.data)
                                                    return \`${cStr}\``))
                    }
                    data.forEach((loopChild, childIdx) => {
                        if (!loopChild || loopChild.constructor !== Object) {
                            loopChild = {data: loopChild}
                        }

                        if ( $loop ) {

                            tpl = new Function(DomUtil.toES5(`const {${Object.keys(loopChild).join(',')}} = this.${s},
                                                    Util = this.Util,
                                                    _i = Util.tryCatch.bind(this),
                                                    _t = this._t.bind(this.scope.data)
                                                    return \`${cStr}\``))
                        }
                        // back to json
                        loopChild._index = childIdx
                        // remove tabs and parse
                        const json = JSON.parse(tpl.call({
                            [s]: loopChild,
                            scope,
                            Util: Util,
                            _t
                        }).replace(/\t/g, '\\t'))

                        const key = rootKey + '.' + aIdx + '.$loop.' + childIdx
                        scope[s] = loopChild
                        h.push(this.parseRec(json, key, scope))


                    })
                } catch (ex) {
                    console.log(ex, c)
                    if (ex.message.startsWith('Unexpected token')) {
                        console.error('There is an error in the Json. Try to use Util.escapeForJson')
                    }
                    return 'Error in parseRec: ' + ex.message
                }


            } else {

                const {editMode, location, match, dynamic, history, children} = this.props

                const key = rootKey + '.' + aIdx
                let tagName, className, properties = {}
                if (!t || t.constructor !== String) {
                    tagName = 'div'
                } else if (t === '$children') {
                    if (children) {
                        h.push(children)
                    }
                    return
                } else if (t.slice(-1) === '$') {
                    // editable
                    tagName = t.slice(0, -1) // remove last char
                    if (editMode && !dynamic) {
                        properties.tag = tagName
                        tagName = 'ContentEditable'
                    }
                } else {
                    tagName = t
                }
                if (tagName.indexOf('.') >= 0) {
                    const arr = tagName.split('.')
                    tagName = arr[0]
                    arr.shift()
                    className = arr.join(' ')
                }


                if (p) {
                    // remove properties with empty values
                    Object.keys(p).forEach(key => p[key] === '' && delete p[key])
                    properties = Object.assign(properties, p)
                    // replace events with real functions and pass payload
                    JsonDom.events.forEach((e) => {
                        if (properties['on' + e] && properties['on' + e].constructor === Object) {
                            const payload = properties['on' + e]
                            properties['on' + e] = (...args) => {
                                const eLower = e.toLowerCase()
                                this.runJsEvent(eLower, false, payload, ...args)
                            }
                        }
                    })
                    if (properties.style && properties.style.constructor === String) {
                        //Parses a string of inline styles into a javascript object with casing for react
                        properties.style = parseStyles(properties.style)
                    }
                    if (properties.name) {
                        // handle controlled input here
                        if (properties.value === undefined) {
                            properties.value = (properties.type === 'checkbox' ? false : '')
                        }
                        if (!this.bindings[properties.name]) {
                            this.bindings[properties.name] = properties.value
                        } else {
                            properties.value = this.bindings[properties.name]
                        }
                        properties.onChange = this.handleBindingChange.bind(this, properties.onChange)

                        properties.time = new Date()
                    } else if (properties.value) {
                        console.warn(`Don't use property value without name in ${scope.page.slug}`)
                    }
                }


                let eleType = JsonDom.components[tagName] || this.extendedComponents[tagName] || tagName

                if (eleType.constructor === Object) {
                    eleType = eleType.component
                }
                const eleProps = Object.assign({
                        key,
                        _key: key,
                        location,
                        history,
                        match
                    }, properties
                )

                if (t === 'Cms') {
                    // if we have a cms component in another cms component the location props gets not refreshed
                    // that's way we pass it directly to the reactElement as a prop
                    eleProps._this = this
                }

                if (editMode) {
                    eleProps._this = this
                    eleProps._editmode = 'true'
                }
                if (className) {
                    eleProps.className = className + (eleProps.className ? ' ' + eleProps.className : '')
                }

                if (editMode && this.props.inlineEditor && (initial || !dynamic)) {
                    const rawJson = this.getJsonRaw(this.props, true)
                    if (rawJson) {
                        eleProps._WrappedComponent = eleType
                        eleProps._scope = scope
                        eleProps._json = rawJson
                        eleProps._onchange = this.props.onChange
                        eleType = JsonDomHelper
                    }
                }
                if ($c) {
                    eleProps.dangerouslySetInnerHTML = {__html: $c}
                }


                if ($wait === 'visible' && !!window.IntersectionObserver) {
                    h.push(React.createElement(
                        waitUntilVisible({jsonDom: this, key, scope, eleType, eleProps, c, $c}),
                        {key: key}
                    ))
                } else {

                    h.push(React.createElement(
                        eleType,
                        eleProps,
                        ($c ? null : this.parseRec(c, key, scope))
                    ))
                }
            }
        })
        return h
    }

    getScope(props) {
        if (this.updateScope) {
            this.updateScope = false

            // set page property
            this.scope.page = {slug: props.slug}
            this.scope.user = props.user
            this.scope.editMode = props.editMode
            this.scope.dynamic = props.dynamic

            // set default scope values
            this.scope.fetchingMore = false

            // add a refrence to the global app object
            this.scope._app_ = _app_

            // add a reference of the bindings object
            this.scope.bindings = this.bindings

            this.addLocationToScope()
        }
        return this.scope
    }

    addLocationToScope() {
        if (typeof window !== 'undefined') {
            this.scope.pathname = this.props.history.location.pathname
            this.scope.params = Util.extractQueryParams()
            this.scope.hashParams = (window.location.hash ? Util.extractQueryParams(window.location.hash.substring(1)) : {})
        }
    }

    getJson(props) {
        if (this.json) return this.json
        const {template} = props
        const scope = this.getScope(props)
        this._inHtmlComponents = []
        try {
            /*
             This is the modified version of the json (placeholder are replaced)
             */
            this.json = JSON.parse(this.renderTemplate(template, scope))
        } catch (e) {
            console.log(e, this.renderTemplate(template, scope))
            this.emitJsonError(e)
        }
        return this.json
    }

    getJsonRaw(props, ignoreError) {
        if (this.jsonRaw) return this.jsonRaw
        const {template} = props

        if (template.trim().startsWith('<')) {
            console.warn("Not supported for html content")
            return null
        }
        try {
            /*
             jsonRaw is the unmodified json for editing
             */
            this.jsonRaw = JSON.parse(template)
        } catch (e) {
            console.log(e, template)
            if (!ignoreError)
                this.emitJsonError(e)
        }
        return this.jsonRaw
    }


    moveInHtmlComponents() {
        // move elements to right place
        for (let i = 0; i < this._inHtmlComponents.length; i++) {
            const key = this._inHtmlComponents[i][0].key
            const ele = Util.$('[_key="' + key + '-0.0"]')
            if (!ele || ele.length === 0) {
                //try again
                console.log('not ready try again')
                setTimeout(() => {
                    this.moveInHtmlComponents()
                }, 100)
                return
            }
            ele.oriParent = ele.parentNode
            const container = Util.$('#' + key.substr(0, key.length - 2))
            if (container.appendChild) {
                container.appendChild(ele)
            }
        }
    }

    renderTemplate(str, scope) {
        str = str.trim()
        // Simple content type detection
        if (str.startsWith('<')) {
            //It is html
            str = JSON.stringify({
                t: 'div',
                $c: Util.escapeForJson(str)
            })
        } else if (str.startsWith('{') || str.startsWith('[')) {
            //It is json
            // replace control character
            str = str.replace(/\\/g, '\\\\').replace(/"###/g, '').replace(/###"/g, '')
        } else {
            //Is other
            str = JSON.stringify({
                t: 'MarkDown',
                c: Util.escapeForJson(str)
            }).replace(/\`/g, '\\`')
        }
        try {
            // Scope properties get destructed so they can be accessed directly by property name
            return new Function(DomUtil.toES5(`const {${Object.keys(scope).join(',')}} = this.scope,
            Util = this.Util,
            _i = Util.tryCatch.bind(this),
            _r = this.renderIntoHtml,
            _t = this._t.bind(data)
            return \`${str}\``)).call({
                scope,
                parent: this.props._parentRef,
                Util,
                _t,
                // expose some attributes
                renderIntoHtml: this.renderIntoHtml,
                serverMethod: this.serverMethod,
                props: this.props
            }).replace(/\t/g, '\\t')

        } catch (e) {
            //this.emitJsonError(e)
            console.error('Error in renderTemplate', e)
            return str
        }
    }

    runJsEvent(name, async, ...args) {
        let hasError = false, t = this.jsOnStack[name]
        if (t && t.length) {
            for (let i = 0; i < t.length; i++) {
                const cb = t[i]
                if (cb) {
                    try {
                        if (async) {
                            setTimeout(() => {
                                cb(...args)
                            }, 0)
                        } else {
                            cb(...args)
                        }
                    } catch (e) {
                        console.log(name, e)
                        hasError = true
                    }
                }
            }
        }
        // pass event to parent
        if (this.props._parentRef && args.length && args[0]._passEvent) {
            this.props._parentRef.runJsEvent(name, async, ...args)
        }
        return !hasError
    }


    fetchMore = (callback) => {
        const scope = this.getScope(this.props)
        if (scope.fetchingMore || !this._ismounted) {
            return
        }
        if (!scope.params.page) {
            scope.params.page = 1
        }
        scope.params.page = parseInt(scope.params.page) + 1

        scope.fetchingMore = true
        this.forceUpdate()

        let query = ''
        const keys = Object.keys(scope.params)
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i]
            if (query) query += '&'
            query += `${key}=${scope.params[key]}`
        }

        this.props.onFetchMore(query, (res) => {
            if (res.cmsPage && res.cmsPage.resolvedData) {
                const newData = JSON.parse(res.cmsPage.resolvedData)

                this.resolvedDataJson = deepMergeConcatArrays(this.resolvedDataJson, newData)
                scope.fetchingMore = false

                if (this._ismounted)
                    this.forceUpdate()
            }
            if (callback && callback.constructor === Function) {
                callback()
            }
        })
    }

    serverMethod = (name, args, cb) => {
        if (!cb) {

            JsonDom.instanceCounter++
            const key = 'serverMethod' + JsonDom.instanceCounter

            this.props.serverMethod(name, args, (response) => {
                Util.$('#' + key).innerHTML = response.data.cmsServerMethod.result
            })
            return '<div id=\'' + key + '\'>Here goes the content</div>'
        }
        this.props.serverMethod(name, args, cb)
    }


    renderIntoHtml = (c) => {

        JsonDom.instanceCounter++
        const key = 'inHtmlComponent' + JsonDom.instanceCounter
        this._inHtmlComponents.push(this.parseRec(c, key, this.scope))

        return '<div id=' + key + '></div>'
    }

    on = (keys, cb) => {
        if (keys.constructor !== Array) {
            keys = [keys]
        }
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i]
            const keyLower = key.toLowerCase()
            if (!this.jsOnStack[keyLower]) this.jsOnStack[keyLower] = []
            this.jsOnStack[keyLower].push(cb)
        }
    }

    getLocal = (key, def) => {
        if (typeof localStorage === 'undefined') return def
        const value = localStorage.getItem(key)
        if (value) {
            try {
                const o = JSON.parse(value)
                return o
            } catch (e) {
                return value
            }
        }
        return def
    }
    setLocal = (key, value) => {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(key, JSON.stringify(value))
        }
    }
    getRootComponent = () => {
        let p = this, root
        while (p) {
            root = p
            p = p.props._parentRef
        }
        return root
    }
    getComponent = (id) => {
        if (!id) {
            return null
        }

        const jsGetComponentRec = (comp, id) => {
            let res = null
            if (comp && comp.componentRefs) {
                let k
                for (k of Object.keys(comp.componentRefs)) {
                    const o = comp.componentRefs[k]
                    if (id === k) {
                        res = o
                        break
                    } else {
                        res = jsGetComponentRec(o, id)
                        if (res) {
                            break
                        }
                    }
                }

            }
            return res
        }
        return jsGetComponentRec(this.getRootComponent(), id)
    }

    setStyle = (style, preprocess, id) => DomUtil.createAndAddTag('style', 'head', {
        innerHTML: preprocess ? preprocessCss(style) : style,
        data: {jsonDomId: this.instanceId},
        id
    })

    addMetaTag = (name, content) => DomUtil.createAndAddTag('meta', 'head', {
        name,
        content,
        data: {jsonDomId: this.instanceId}
    })

    refresh = (id, runScript) => {
        if (id === true) {
            runScript = true
            id = null
        }

        let nodeToRefresh
        if (id) {
            nodeToRefresh = this.getComponent(id)
        } else {
            // if no id is defined select the current dom
            nodeToRefresh = this
        }

        if (nodeToRefresh) {
            if (!nodeToRefresh._ismounted) {
                console.warn(`Component ${id} is not mounted`, nodeToRefresh)
                return false
            }
            nodeToRefresh.json = null
            if (runScript) {
                nodeToRefresh.runScript = true
            }
            nodeToRefresh.forceUpdate()
        }
    }

}

JsonDom.propTypes = {
    className: PropTypes.string,
    template: PropTypes.string,
    resolvedData: PropTypes.string,
    resources: PropTypes.string,
    script: PropTypes.string,

    slug: PropTypes.string,
    user: PropTypes.object,

    /* states */
    renewing: PropTypes.bool,
    aboutToChange: PropTypes.bool,

    /* Methods */
    setKeyValue: PropTypes.func,
    serverMethod: PropTypes.func,
    clientQuery: PropTypes.func,
    subscriptionCallback: PropTypes.func,
    onChange: PropTypes.func, /* Is fired when the json dom changes */
    onError: PropTypes.func,
    onFetchMore: PropTypes.func,

    /* editMode */
    editMode: PropTypes.bool,
    inlineEditor: PropTypes.bool,
    _key: PropTypes.string,

    /* properties that are passed from another component */
    _props: PropTypes.object,
    _parentRef: PropTypes.object,

    /* Routing */
    history: PropTypes.object,
    location: PropTypes.object,
    match: PropTypes.object,

    children: PropTypes.any,
    id: PropTypes.string,
    /* if dynamic is set to true that means it is a child of another JsonDom */
    dynamic: PropTypes.bool,
    userActions: PropTypes.object.isRequired,
}

export default JsonDom
