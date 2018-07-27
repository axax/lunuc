import React from 'react'
import PropTypes from 'prop-types'
import {SimpleMenu, DrawerLayout, Button, Divider, Col, Row, SimpleToolbar, Card, DeleteIconButton} from 'ui'
import Hook from 'util/hook'
import CmsViewContainer from '../containers/CmsViewContainer'
import {Link} from 'react-router-dom'
import _t from 'util/i18n'
import Util from 'client/util'
import Async from 'client/components/Async'
import {getKeyValueFromLS} from '../containers/generic/withKeyValues'


const ContentEditable = (props) => <Async {...props}
                                          load={import(/* webpackChunkName: "admin" */ '../components/generic/ContentEditable')}/>

const JsonDomHelper = (props) => <Async {...props}
                                        load={import(/* webpackChunkName: "admin" */ '../components/cms/JsonDomHelper')}/>


const TEMPLATE_EVENTS = ['Click', 'KeyDown', 'Change']

class JsonDom extends React.Component {

    components = {
        'input': JsonDomInput,
        'SimpleMenu': SimpleMenu,
        'Link': Link,
        'Cms': ({...rest}) => <CmsViewContainer _parentRef={this} dynamic={true} {...rest}/>,
        'SimpleToolbar': ({position, ...rest}) => <SimpleToolbar
            position={(this.props.editMode ? 'static' : position)} {...rest} />,
        'Button': Button,
        'Divider': Divider,
        'Card': Card,
        'Col': Col,
        'Row': Row,
        'h1$': ({id, children, ...rest}) => <h1 id={id} {...rest}><ContentEditable
            onChange={(v) => this.emitChange(id, v)}
            onBlur={(v) => this.emitChange(id, v, true)}>{children}</ContentEditable></h1>,
        'h2$': ({id, children, ...rest}) => <h2 id={id} {...rest}><ContentEditable
            onChange={(v) => this.emitChange(id, v)}
            onBlur={(v) => this.emitChange(id, v, true)}>{children}</ContentEditable></h2>,
        'p$': ({id, children, ...rest}) => <p id={id} {...rest}><ContentEditable
            onChange={(v) => this.emitChange(id, v)}
            onBlur={(v) => this.emitChange(id, v, true)}>{children}</ContentEditable></p>
    }

    json = null
    jsonRaw = null
    scope = null
    parseError = null
    runScript = true
    scriptResult = null
    componentRefs = {} // this is the object with references to elements with identifier
    jsOnStack = {}
    jsOn = (key, cb) => {
        const keyLower = key.toLowerCase()
        if (!this.jsOnStack[keyLower]) this.jsOnStack[keyLower] = []
        this.jsOnStack[keyLower].push(cb)
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
            nodeToRefresh.jsOnStack = {}
        }
        nodeToRefresh.forceUpdate()

    }

    resolvedDataJson = undefined

    constructor(props) {
        super(props)
        this.state = {hasReactError: false, bindings: {}}

        /* HOOK */
        Hook.call('JsonDom', this)

        this.addParentRef(props)
    }


    componentDidCatch() {
        this.setState({hasReactError: true})
    }

    UNSAFE_componentWillReceiveProps(props) {

        this.addParentRef(props)
        if (this.props.scope !== props.scope) {
            this.scope = null
            this.json = null
            /* if( this.props.scope.params !== props.scope.params ){
             // set it to undefined. null wouldn't be enough because null can also be a resolved value
             this.resolvedDataJson = undefined

             console.log('reset scope data res')
             }*/
        }
        if (this.props.template !== props.template) {
            this.resetTemplate()
            //console.log('reset template')
        }
        if (this.props.script !== props.script) {
            this.resetTemplate()
            this.scriptResult = null
            this.jsOnStack = {}
            this.runScript = true
            //console.log('reset script')
        }
        if (this.props.resolvedData !== props.resolvedData) {
            this.resolvedDataJson = undefined
            this.json = null
            //console.log('reset resolvedData')
        }
        this.setState({hasReactError: false})
    }

    shouldComponentUpdate(props, state) {
        if (state.hasReactError) return true

        if (!props.template || !props.scope) return true

        return props.children !== this.props.children || this.props.template !== props.template || this.props.scope !== props.scope || this.props.script !== props.script || this.props.resolvedData !== props.resolvedData
    }

    UNSAFE_componentWillUpdate(props) {
        this.parseError = null
    }

    componentWillUnmount() {
        if (this.jsOnStack['unmount']) {
            this.jsOnStack['unmount'].forEach(cb => {
                if (cb) {
                    cb()
                }
            })
        }
        this.resetTemplate()
    }

    addParentRef(props) {
        const {id, _parentRef} = props
        if (_parentRef && id) {
            props._parentRef.componentRefs[id] = this
        }
    }

    resetTemplate() {
        this.json = null
        this.jsonRaw = null
        this.componentRefs = {}
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

    emitChange(id, v, save) {
        const {onChange} = this.props

        if (!onChange)
            return

        var jsonClone = this.getJsonRaw(this.props)
        const ids = id.split('.')
        ids.shift()

        let cur = jsonClone
        ids.forEach((i) => {
            if (cur.c) {
                cur = cur.c[i]
            } else {
                cur = cur[i]
            }
        })
        cur.c = v

        onChange(jsonClone, save)
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

            const {t, p, c, $c, $loop, $if} = item
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

                if (!data || data.constructor !== Array) return ''
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
                        const tpl = new Function('const {' + Object.keys(loopChild).join(',') + '} = this.' + s + ';return `' + cStr + '`;')
                        // back to json
                        loopChild._index = childIdx
                        // remove tabs and parse
                        const json = JSON.parse(tpl.call({
                            [s]: loopChild,
                            scope: this.scope,
                            escape: Util.escapeForJson,
                            tryCatch: Util.tryCatch
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
                                if (this.jsOnStack[eLower]) {
                                    this.jsOnStack[eLower].forEach(cb => {
                                        if (cb) {
                                            cb(payload, eo)
                                        }
                                    })
                                }
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

                let eleType = this.components[_t] || _t
                const eleProps = {id: key, key, ...cmsProps, ..._p}
                if (this.props.editMode) {
                    const _item = Util.getComponentByKey(key, this.getJsonRaw(this.props))
                    if (_item) {
                        eleProps._WrappedComponent = eleType
                        eleProps._key = key
                        eleProps._item = _item
                        eleType = JsonDomHelper
                    }
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
            console.log(e)
            this.emitJsonError(e)
        }
        return this.json
    }

    getJsonRaw(props) {
        if (this.jsonRaw) return this.jsonRaw
        const {template} = props
        try {
            /*
             jsonRaw is the unmodified json for editing
             */
            this.jsonRaw = JSON.parse(template)
        } catch (e) {
            this.emitJsonError(e)
        }
        return this.jsonRaw
    }


    renderString(str, data) {
        try {
            const tpl = new Function('const {' + Object.keys(data).join(',') + '} = this.data;const parent = this.parent;return `' + str + '`;')
            //.replace(/(\r\n|\n|\r)/g,"");
            return tpl.call({
                data,
                parent: this.props._parentRef,
                tryCatch: Util.tryCatch.bind(data)
            }).replace(/\t/g, '\\t')
        } catch (e) {
            //this.emitJsonError(e)
            console.error('Error in renderString', e)
            return str
        }
    }

    render() {
        const {dynamic, template, script, resolvedData, history, className, setKeyValue, clientQuery} = this.props
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
        if (this.runScript) {
            this.runScript = false

            try {
                this.scriptResult = new Function(`
                let scope = arguments[0]
                const {on, setLocal, getLocal, refresh, getComponent, Util, _t, setKeyValue, getKeyValueFromLS, clientQuery}= arguments[1]
                const history= arguments[2]
                const parent= arguments[3]
                on('refreshscope',(newScope)=>{
                    scope = newScope
                })
                ${script}`).call(this, scope, {
                    on: this.jsOn,
                    clientQuery,
                    setKeyValue,
                    getKeyValueFromLS,
                    setLocal: this.jsSetLocal,
                    getLocal: this.jsGetLocal,
                    refresh: this.jsRefresh,
                    getComponent: this.jsGetComponent,
                    Util,
                    _t
                }, history, this.props._parentRef)
            } catch (e) {
                jsError = e.message
            }
            if (jsError) {
                return <div>Error in the script: <strong>{jsError}</strong></div>
            }
        } else {
            // if script was already executed only refresh the scope
            this.jsOnStack['refreshscope'].forEach(cb => {
                cb(scope)
            })
        }
        scope.script = this.scriptResult || {}
        if (this.jsOnStack['beforerender']) {
            for (let i = 0; i < this.jsOnStack['beforerender'].length; i++) {
                const cb = this.jsOnStack['beforerender'][i]
                if (cb) {
                    try {
                        cb(scope)
                    } catch (e) {
                        console.log(e)
                        return <div>Error in script in beforeRender event: <strong>{e.message}</strong></div>
                    }
                }
            }
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
    clientQuery: PropTypes.func,
    className: PropTypes.string,
    template: PropTypes.string,
    resolvedData: PropTypes.string,
    script: PropTypes.string,
    scope: PropTypes.string,
    setKeyValue: PropTypes.func,
    onChange: PropTypes.func,
    onError: PropTypes.func,
    editMode: PropTypes.bool,
    _parentRef: PropTypes.object,
    history: PropTypes.object,
    children: PropTypes.any,
    id: PropTypes.string,
    /* if dynamic is set to true that means it is a child of another JsonDom */
    dynamic: PropTypes.bool
}

export default JsonDom


/* Wrapper for input so we are able to pass a value prop  */
class JsonDomInput extends React.Component {
    state = {value: ''}

    constructor(props) {
        super(props)
        this.state = {
            value: props.value
        }
    }

    shouldComponentUpdate(props, state) {
        return state.value !== this.state.value
    }

    UNSAFE_componentWillReceiveProps(props) {
        if (props.value)
            this.setState({value: props.value})
    }

    valueChange = (e) => {
        const {onChange} = this.props
        this.setState({value: e.target.value})
        if (onChange) {
            onChange(e)
        }
    }

    render() {
        const {value, onChange, ...rest} = this.props
        return <input onChange={this.valueChange.bind(this)} value={this.state.value} {...rest} />
    }

}


JsonDomInput.propTypes = {
    value: PropTypes.string,
    onChange: PropTypes.func
}

