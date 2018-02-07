import React from 'react'
import PropTypes from 'prop-types'
import ContentEditable from '../components/generic/ContentEditable'
import {SimpleMenu, DrawerLayout, Button, Divider, Col, Row, SimpleToolbar, Card, DeleteIconButton} from 'ui'
import Hook from 'util/hook'
import CmsViewContainer from '../containers/CmsViewContainer'
import {Link} from 'react-router-dom'


const TEMPLATE_EVENTS = ['Click','KeyDown']

class JsonDom extends React.Component {

    components = {
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
        'h1$': ({id, ...rest}) => <h1><ContentEditable onChange={(v) => this.emitChange(id, v)}
                                                       onBlur={(v) => this.emitChange(id, v, true)} {...rest} /></h1>,
        'h2$': ({id, ...rest}) => <h2><ContentEditable onChange={(v) => this.emitChange(id, v)}
                                                       onBlur={(v) => this.emitChange(id, v, true)} {...rest} /></h2>,
        'p$': ({id, ...rest}) => <p><ContentEditable onChange={(v) => this.emitChange(id, v)}
                                                     onBlur={(v) => this.emitChange(id, v, true)} {...rest} /></p>
    }

    json = null
    jsonRaw = null
    scope = null
    parseError = null
    runScript = true
    scriptResult = null
    componentRefs = {} // this is the object with references to elements with identifier
    jsOnStack = []
    jsOn = (key, cb) => {
        this.jsOnStack.push({key, cb})
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
    jsRefresh = (id) => {

        let nodeToRefresh = this

        if (id && this.componentRefs[id]) {
            nodeToRefresh = this.componentRefs[id]
        } else {
            nodeToRefresh = this
        }
        nodeToRefresh.json = null
        nodeToRefresh.runScript = true
        nodeToRefresh.jsOnStack = []
        nodeToRefresh.forceUpdate()

    }


    resolvedDataJson = undefined

    constructor(props) {
        super(props)
        this.state = {hasReactError: false}

        /* HOOK */
        Hook.call('JsonDom', {components: this.components})

        const {id, _parentRef} = props
        if (_parentRef && id) {
            props._parentRef.componentRefs[id] = this
        }

    }


    componentDidCatch() {
        this.setState({hasReactError: true})
    }

    componentWillReceiveProps(props) {

        if (this.props.scope !== props.scope) {
            this.scope = null


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
            this.jsOnStack = []
            this.runScript = true
            //console.log('reset script')
        }
        if (this.props.resolvedData !== props.resolvedData) {
            this.resolvedDataJson = undefined
            //console.log('reset resolvedData')
        }
        this.setState({hasReactError: false})
    }

    shouldComponentUpdate(props, state) {
        if (state.hasReactError) return true

        if (!props.template || !props.scope) return true

        return this.props.template !== props.template || this.props.scope !== props.scope || this.props.script !== props.script || this.props.resolvedData !== props.resolvedData
    }

    componentWillUpdate(props) {
        this.parseError = null
    }

    resetTemplate(){
        this.json = null
        this.jsonRaw = null
        this.componentRefs = {}
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
        if (a.constructor !== Array) return ''
        let h = []
        a.forEach((item, aIdx) => {

            if( !item ) return

            const {t, p, c, $loop} = item
            /*
             t = type
             c = children
             p = prop
             */
            if ($loop) {
                const {$d, d, c} = $loop
                let data
                console.log(childScope)


                if ($d) {
                    if( childScope ){
                        data = this.scopeByPath($d, childScope)
                    }else{
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
                        .replace('"$.' + s + '"', '${JSON.stringify(this.' + s + ')}') /* "$.loop" --> ${JSON.stringify(this.loop)} the whole loop item */
                    data.forEach((loopChild, childIdx) => {
                        const tpl = new Function('const {'+Object.keys(loopChild).join(',')+'} = this.'+s+';return `' + cStr + '`;')
                        // back to json
                        loopChild._index = childIdx
                        const json = JSON.parse(tpl.call({[s]: loopChild}))

                        const key = rootKey + '.' + aIdx + '.$loop.' + childIdx
                        h.push(this.parseRec(json, key, {...childScope,[s]:loopChild}))


                    })
                } catch (ex) {
                    return 'Error in parseRec: '+ex.message
                }


            }
            const key = rootKey + '.' + aIdx
            let _t
            if (!t) {
                _t = 'div'
            } else if (!this.props.editMode && t.slice(-1) === '$') {
                _t = t.slice(0, -1) // remove last char
            } else {
                _t = t
            }
            if( p ) {
                // replace events with real functions and pass payload
                TEMPLATE_EVENTS.forEach((e) => {
                    if (p['on'+e] && p['on'+e].constructor === Object) {
                        const payload = p['on'+e]
                        p['on'+e] = (eo) => {
                            this.jsOnStack.forEach((o) => {
                                if (o.cb && o.key.toUpperCase() === e.toUpperCase()) {
                                    o.cb(payload,eo)
                                }
                            })
                        }
                    }
                })
            }

            h.push(React.createElement(
                this.components[_t] || _t,
                {id: key, key, ...p},
                this.parseRec(c, key,childScope)
            ))
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
            const tpl = new Function('const {'+Object.keys(data).join(',')+'} = this;return `' + str + '`;')
            return tpl.call(data)
        } catch (e) {
            //this.emitJsonError(e)

            return str
        }
    }

    render() {
        const {template, script, resolvedData, history} = this.props
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


        if (this.runScript) {
            this.runScript = false
            //console.log('render script')
            try {
                this.scriptResult = new Function(`
                const scope = arguments[0]
                const {on, setLocal, getLocal, refresh}= arguments[1]
                const history= arguments[2]
                ${script}`)(scope, {
                    on: this.jsOn,
                    setLocal: this.jsSetLocal,
                    getLocal: this.jsGetLocal,
                    refresh: this.jsRefresh
                },history)
            } catch (e) {
                jsError = e.message
            }
            if (jsError) {
                return <div>Error in the script: <strong>{jsError}</strong></div>
            }
        }

        scope.script = this.scriptResult
        const content = this.parseRec(this.getJson(this.props), 0)
        console.log(`render ${this.constructor.name} for ${scope.page.slug} in ${((new Date()).getTime() - startTime)}ms`)

        if (this.parseError) {
            return <div>Error in the template: <strong>{this.parseError.message}</strong></div>
        } else {
            return <div className={'Cms-'+scope.page.slug.replace(/[\W_-]+/g,'-')}>{content}</div>
        }

    }

}

JsonDom.propTypes = {
    template: PropTypes.string,
    resolvedData: PropTypes.string,
    script: PropTypes.string,
    scope: PropTypes.string,
    onChange: PropTypes.func,
    onError: PropTypes.func,
    editMode: PropTypes.bool,
    _parentRef: PropTypes.object,
    history: PropTypes.object,
    id: PropTypes.string
}

export default JsonDom
