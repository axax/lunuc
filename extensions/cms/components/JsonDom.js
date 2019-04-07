import React from 'react'
import PropTypes from 'prop-types'
import Hook from 'util/hook'
import _t from 'util/i18n'
import Util from 'client/util'
import {getComponentByKey} from '../util/jsonDomUtil'
import DomUtil from 'client/util/dom'
import Async from 'client/components/Async'
import CmsViewContainer from '../containers/CmsViewContainer'
import {getKeyValueFromLS} from 'client/containers/generic/withKeyValues'
import {
    SimpleMenu as UiSimpleMenu,
    Button as UiButton,
    Divider as UiDivider,
    Col as UiCol,
    Row as UiRow,
    SimpleToolbar as UiSimpleToolbar,
    Card as UiCard
} from 'ui'
import {Link} from 'react-router-dom'
import JsonDomInput from './JsonDomInput'

const JsonDomHelper = (props) => <Async {...props}
                                        load={import(/* webpackChunkName: "admin" */ './JsonDomHelper')}/>

const ContentEditable = (props) => <Async {...props}
                                          load={import(/* webpackChunkName: "admin" */ '../../../client/components/ContentEditable')}/>

const FileDrop = (props) => <Async {...props}
                                   load={import(/* webpackChunkName: "admin" */ '../../../client/components/FileDrop')}/>

const Print = (props) => <Async {...props}
                                load={import(/* webpackChunkName: "admin" */ '../../../client/components/Print')}/>


const TEMPLATE_EVENTS = ['Click', 'KeyDown', 'KeyUp', 'Change', 'Submit']

class JsonDom extends React.Component {

    static components = {
        'FileDrop': {component: FileDrop, label: 'File Drop'},
        'Print': {component: Print, label: 'Printable area'},
        'input': JsonDomInput,
        'textarea': (props) => <JsonDomInput textarea={true} {...props}/>,
        'SimpleMenu': UiSimpleMenu,
        'Link': Link,
        'Cms': ({props, _this, ...rest}) => <CmsViewContainer _props={props} _parentRef={_this}
                                                              dynamic={true} {...rest}/>,
        'SimpleToolbar': ({_this, position, ...rest}) => <UiSimpleToolbar
            position={(_this.props.editMode ? 'static' : position)} {...rest} />,
        'Button': UiButton,
        'Divider': UiDivider,
        'Card': UiCard,
        'Col': UiCol,
        'Row': UiRow,
        'h1$': ({_this, children, ...rest}) => <h1 {...rest}><ContentEditable
            onChange={(v) => _this.emitChange(rest._key, v)}>{children}</ContentEditable></h1>,
        'h2$': ({_this, children, ...rest}) => <h2 {...rest}><ContentEditable
            onChange={(v) => _this.emitChange(rest._key, v)}>{children}</ContentEditable></h2>,
        'p$': ({_this, children, ...rest}) => <p {...rest}><ContentEditable
            onChange={(v) => _this.emitChange(rest._key, v)}>{children}</ContentEditable></p>
    }
    static hock = true
    static instanceCounter = 0

    resolvedDataJson = undefined
    extendedComponents = {}
    json = null
    jsonRaw = null
    scope = null
    parseError = null
    runScript = true
    scriptResult = null
    componentRefs = {} // this is the object with references to elements with identifier
    jsOnStack = {}
    jsOn = (keys, cb) => {
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
    jsGetLocal = (key, def) => {
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
    jsSetLocal = (key, value) => {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(key, JSON.stringify(value))
        }
    }
    jsRootComponent = () => {
        let p = this, root
        while (p) {
            root = p
            p = p.props._parentRef
        }
        return root
    }
    jsGetComponent = (id) => {
        if (!id) {
            return null
        }

        const jsGetComponentRec = (comp, id) => {
            let res = null
            if (comp) {
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
        return jsGetComponentRec(this.jsRootComponent(), id)
    }
    jsRefresh = (id, noScript) => {

        let nodeToRefresh = this.jsGetComponent(id)

        if (!nodeToRefresh) {
            // if no id is defined or not found refresh the current dom
            nodeToRefresh = this
        }
        nodeToRefresh.json = null
        if (!noScript) {
            nodeToRefresh.runScript = true
        }
        nodeToRefresh.forceUpdate()

    }


    constructor(props) {
        super(props)
        JsonDom.instanceCounter++
        this.instanceId = JsonDom.instanceCounter
        if (props.subscriptionCallback) {
            props.subscriptionCallback(this.onSubscription.bind(this))
        }
        this.state = {hasReactError: false, bindings: {}}

        /* HOOK */
        if (JsonDom.hock) {
            // call only once if JsonDom is used somewhere
            JsonDom.hock = false
            Hook.call('JsonDom', JsonDom)
        }

        this.addParentRef(props)
    }


    componentDidCatch() {
        this.setState({hasReactError: true})
    }

    UNSAFE_componentWillReceiveProps(props) {


        if (this.props.resolvedData !== props.resolvedData) {
            this.resolvedDataJson = undefined
            this.json = null
            this.setState({bindings: {}})
        }
        this.setState({hasReactError: false})
    }

    shouldComponentUpdate(props, state) {

        const update = state.hasReactError ||
            !props.template || !props.scope ||
            props.children !== this.props.children ||
            this.props.template !== props.template ||
            this.props._props !== props._props ||
            this.props.scope !== props.scope ||
            this.props.script !== props.script ||
            this.props.inlineEditor !== props.inlineEditor ||
            this.props.resolvedData !== props.resolvedData

        if (update) {
            // do some stuff before update
            this.parseError = null
            this.addParentRef(props)

            const scriptChanged = this.props.script !== props.script

            if (this.props.template !== props.template || this.props._props !== props._props || scriptChanged) {
                this.resetTemplate()
                if (scriptChanged || this.runScript) {
                    this.removeAddedDomElements()
                }
            }

            if (this.props.scope !== props.scope) {
                this.scope = null
                this.json = null
            }

            if (scriptChanged) {
                this.scriptResult = null
                this.runScript = true
            }

            if (this.props.resources !== props.resources) {
                this.checkResources()
            }

        }

        return update

    }

    componentDidMount() {
        this.runJsEvent('mount', true)
        this.checkResources()
    }

    componentWillUnmount() {
        this.runJsEvent('unmount')
        this.resetTemplate()
        this.removeAddedDomElements()
    }

    // is called after render
    componentDidUpdate(props) {
        this.runJsEvent('update', true)
    }

    checkResources() {
        // check if all scripts are loaded
        let allloaded = true, counter = 0
        const scripts = document.querySelectorAll(`script[data-cms-view="true"]`)
        if (scripts) {
            for (let i = 0; i < scripts.length; ++i) {
                const script = scripts[i]
                if (!script.getAttribute('loaded')) {
                    allloaded = false
                    counter++
                    script.onload = () => {
                        counter--
                        if (counter === 0) {
                            this.runJsEvent('resourcesready')
                        }
                    }
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

    resetTemplate() {
        this.runJsEvent('reset')
        this.json = null
        this.jsonRaw = null
        this.componentRefs = {}
    }

    removeAddedDomElements() {
        DomUtil.removeElements(`[data-json-dom-id="${this.instanceId}"]`)
    }

    handleBindingChange(cb, e) {
        this.setState({bindings: {...this.state.bindings, [e.target.name]: e.target.value}}, () => {
            if (this.scope) {
                this.scope.bindings = this.state.bindings
            }
            if (cb) {
                cb.bind(this)(e)
            }
            //this.jsRefresh(null, true)
        })
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

    scopeByPath(path, scope) {
        try {
            // get data from scope by path (foo.bar)
            return path.split('.').reduce((res, prop) => res[prop], scope)
        } catch (e) {
            this.emitJsonError(e)
        }
    }

    parseRec(a, rootKey, childScope) {
        if (!a) return null
        if (a.constructor === String) return a
        if (a.constructor === Object) return this.parseRec([a], rootKey, childScope)
        if (a.constructor !== Array) return ''
        let h = []
        a.forEach((item, aIdx) => {

            if (!item) return

            const {t, p, c, $c, $loop, $if, x} = item
            /*
             t = type
             c = children
             $c = children as html
             $if = condition (only parse if condition is fullfilled)
             p = prop
             */
            if ($if) {
                // check condition
                try {
                    const tpl = new Function('const {' + Object.keys(this.scope).join(',') + '} = this.scope;return ' + $if + ';')
                    if (!tpl.call({scope: this.scope})) {
                        return
                    }
                } catch (e) {
                    console.log(e, this.scope)
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
            if ($loop) {
                const {$d, d, c} = $loop
                let data
                if ($d) {
                    if (childScope) {
                        data = this.scopeByPath($d, childScope)
                    } else {
                        data = this.scopeByPath($d, this.scope)
                    }
                } else {
                    data = d
                }

                if (!data) return ''
                if (data.constructor === Object) {
                    data = Object.keys(data).map((k) => {
                        return {key: k, value: data[k]}
                    })
                }

                if (data.constructor !== Array) return ''
                let {s} = $loop
                if (!s) s = 'loop'
                /*
                 d = data in loop
                 $d = data (json as string) in loop
                 c = children in loop
                 s = scope in loop to access data
                 */
                try {
                    const re = new RegExp('\\$\\.' + s + '{', 'g')
                    const cStr = JSON.stringify(c).replace(re, '${') /* $.loop{ --> ${ */
                        .replace('"$.' + s + '"', '${JSON.stringify(this.' + s + ')}')

                    /* "$.loop" --> ${JSON.stringify(this.loop)} the whole loop item */
                    data.forEach((loopChild, childIdx) => {

                        if (loopChild.constructor !== Object) {
                            loopChild = {data: loopChild}
                        }
                        const tpl = new Function('const {' + Object.keys(loopChild).join(',') + '} = this.' + s + ';const Util = this.Util;return `' + cStr + '`;')
                        // back to json
                        loopChild._index = childIdx
                        // remove tabs and parse
                        const json = JSON.parse(tpl.call({
                            [s]: loopChild,
                            scope: this.scope,
                            Util: Util,
                            escape: Util.escapeForJson,
                            tryCatch: Util.tryCatch,
                            _t
                        }).replace(/\t/g, '\\t'))

                        const key = rootKey + '.' + aIdx + '.$loop.' + childIdx
                        h.push(this.parseRec(json, key, {...childScope, [s]: loopChild}))


                    })
                } catch (ex) {
                    console.log(ex, c)
                    return 'Error in parseRec: ' + ex.message
                }


            } else {
                const key = rootKey + '.' + aIdx
                let _t
                if (!t) {
                    _t = 'div'
                } else if (t === '$children') {
                    if (this.props.children) {
                        h.push(this.props.children)
                    }
                    return
                } else if (!this.props.editMode && t.slice(-1) === '$') {
                    _t = t.slice(0, -1) // remove last char
                } else {
                    _t = t
                }

                let _p
                if (p) {
                    _p = Object.assign({}, p)
                    // replace events with real functions and pass payload
                    TEMPLATE_EVENTS.forEach((e) => {
                        if (_p['on' + e] && _p['on' + e].constructor === Object) {
                            const payload = _p['on' + e]
                            _p['on' + e] = (eo) => {
                                const eLower = e.toLowerCase()
                                this.runJsEvent(eLower, false, payload, eo)
                            }
                        }
                    })
                    if (_p.name) {
                        // handle controlled input here
                        if (_p.value === undefined) {
                            _p.value = ''
                        }
                        if (!this.state.bindings[_p.name]) {
                            this.state.bindings[_p.name] = _p.value
                            this.scope.bindings = this.state.bindings
                        }
                        _p.onChange = this.handleBindingChange.bind(this, _p.onChange)

                    } else if (_p.value) {
                        console.warn('Don\'t use property value without name')
                    }
                }

                // if we have a cms component in another cms component the location props gets not refreshed
                // that's way we pass it directly to the reactElement as a prop
                let cmsProps = null
                if (t === 'Cms') {
                    cmsProps = {location: this.props.history.location}
                }
                let eleType = JsonDom.components[_t] || this.extendedComponents[_t] || _t
                if (eleType.constructor === Object) {
                    eleType = eleType.component
                }
                const eleProps = {
                    _this: this,
                    id: key,
                    key,
                    _key: key,
                    _editmode: this.props.editMode.toString(), ...cmsProps, ..._p
                }
                if (this.props.editMode && this.props.inlineEditor) {
                    eleProps._WrappedComponent = eleType
                    eleProps._scope = this.scope
                    eleProps._json = this.getJsonRaw(this.props)
                    eleProps._onchange = this.props.onChange
                    eleType = JsonDomHelper
                }
                h.push(React.createElement(
                    eleType,
                    eleProps,
                    ($c ? <span dangerouslySetInnerHTML={{__html: $c}}/> :
                        this.parseRec(c, key, childScope))
                ))
            }
        })
        return h
    }

    getScope(props) {
        if (this.scope) return this.scope
        const {scope} = props
        this.scope = JSON.parse(scope)

        return this.scope
    }

    getJson(props) {
        if (this.json) return this.json
        const {template} = props
        const scope = this.getScope(props)
        try {
            /*
             json is the modified version for viewing (placeholder are replaced)
             */
            this.json = JSON.parse(this.renderString(template, scope))
        } catch (e) {
            console.log(e, this.renderString(template, scope))
            this.emitJsonError(e)
        }
        return this.json
    }

    getJsonRaw(props) {
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
            console.log(e)
            this.emitJsonError(e)
        }
        return this.jsonRaw
    }


    renderString(str, data) {

        if (str.trim().startsWith('<')) {
            //its html
            str = JSON.stringify({
                t: 'div',
                $c: Util.escapeForJson(str)
            })
        } else {
            //Escape double time
            str = str.replace(/\\/g, '\\\\')
        }
        try {
            const tpl = new Function('const {' + Object.keys(data).join(',') + '} = this.data;const _i = this.tryCatch;return `' + str + '`;')
            //.replace(/(\r\n|\n|\r)/g,"");
            return tpl.call({
                data,
                parent: this.props._parentRef,
                escape: Util.escapeForJson,
                tryCatch: Util.tryCatch.bind(data)
            }).replace(/\t/g, '\\t')
        } catch (e) {
            //this.emitJsonError(e)
            console.error('Error in renderString', e)
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
        return !hasError
    }

    render() {
        const {dynamic, template, script, resolvedData, history, className, setKeyValue, clientQuery, _props} = this.props
        if (!template) {
            console.warn('Template is missing.')
            return null
        }

        const {hasReactError} = this.state

        if (hasReactError) {
            return <strong>There is something wrong with one of the components defined in the json content. See
                console.log in the browser for more detail.</strong>
        }

        const startTime = (new Date()).getTime()

        const scope = this.getScope(this.props)
        let jsError, resolveDataError

        if (this.resolvedDataJson === undefined) {
            try {
                this.resolvedDataJson = JSON.parse(resolvedData)
                if (this.resolvedDataJson.error) {
                    resolveDataError = this.resolvedDataJson.error
                }
            } catch (e) {
                resolveDataError = e.message
            }

            if (resolveDataError) {
                return <div>Error in data resolver: <strong>{resolveDataError}</strong></div>
            }
        }
        scope.data = this.resolvedDataJson
        scope._app_ = _app_
        scope._t = _t
        scope.props = _props
        if (this.runScript) {
            this.runScript = false

            // find root parent
            let root = this, parent = this.props._parentRef
            while (root.props._parentRef) {
                root = root.props._parentRef
            }
            scope.root = root
            scope.parent = parent
            try {
                this.jsOnStack = {}
                this.scriptResult = new Function(`
                let scope = arguments[0].scope
                const {parent, root, history, addMetaTag, setStyle, on, setLocal, getLocal, refresh, getComponent, Util, _t, setKeyValue, getKeyValueFromLS, clientQuery}= arguments[0]
                on('refreshscope',(newScope)=>{
                    scope = newScope
                })
                ${script}`).call(this, {
                    scope,
                    on: this.jsOn,
                    clientQuery,
                    setKeyValue,
                    getKeyValueFromLS,
                    setStyle: (innerHTML) => DomUtil.createAndAddTag('style', 'head', {
                        innerHTML,
                        data: {jsonDomId: this.instanceId}
                    }),
                    addMetaTag: (name, content) => DomUtil.createAndAddTag('meta', 'head', {
                        name,
                        content,
                        data: {jsonDomId: this.instanceId}
                    }),
                    setLocal: this.jsSetLocal,
                    getLocal: this.jsGetLocal,
                    refresh: this.jsRefresh,
                    getComponent: this.jsGetComponent,
                    Util,
                    _t,
                    history,
                    root,
                    parent
                })
            } catch (e) {
                jsError = e.message
            }
            if (jsError) {
                return <div>Error in the script: <strong>{jsError}</strong></div>
            }
        } else {
            // if script was already executed only refresh the scope
            this.runJsEvent('refreshscope', false, scope)
        }
        scope.script = this.scriptResult || {}

        if (!this.runJsEvent('beforerender', false, scope)) {
            return <div>Error in script in {name} event: <strong>{e.message}</strong></div>
        }

        let content = this.parseRec(this.getJson(this.props), 0)

        console.log(`render ${this.constructor.name} for ${scope.page.slug} in ${((new Date()).getTime() - startTime)}ms`)
        if (this.parseError) {
            return <div>Error in the template: <strong>{this.parseError.message}</strong></div>
        } else {

            content = <div
                className={'JsonDom Cms-' + scope.page.slug.replace(/[\W_-]+/g, '-') + (className ? ' ' + className : '')}>{content}</div>

            if (!dynamic) {
                const p = scope.page.slug.split('/')
                let path = ''
                for (let i = 0; i < p.length - 1; i++) {
                    if (path !== '') path += '-'
                    path += p[i]
                    content = <div
                        className={'Cms-' + path}>{content}</div>
                }
            }
            return content
        }

    }

}

JsonDom.propTypes = {
    subscriptionCallback: PropTypes.func,
    clientQuery: PropTypes.func,
    className: PropTypes.string,
    template: PropTypes.string,
    resolvedData: PropTypes.string,
    resources: PropTypes.string,
    script: PropTypes.string,
    scope: PropTypes.string,
    setKeyValue: PropTypes.func,
    /* Is fired when the json dom changes */
    onChange: PropTypes.func,
    onError: PropTypes.func,
    editMode: PropTypes.bool,
    inlineEditor: PropTypes.bool,
    _parentRef: PropTypes.object,
    /* properties that are passed from another component */
    _props: PropTypes.object,
    history: PropTypes.object,
    children: PropTypes.any,
    id: PropTypes.string,
    /* if dynamic is set to true that means it is a child of another JsonDom */
    dynamic: PropTypes.bool
}

export default JsonDom
