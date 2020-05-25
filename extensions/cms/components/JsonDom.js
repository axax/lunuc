import React from 'react'
import ReactDOM from 'react-dom'
import PropTypes from 'prop-types'
import Hook from 'util/hook'
import _t from 'util/i18n'
import Util from 'client/util'
import {propertyByPath, matchExpr} from '../../../client/util/json'
import QuillEditor from 'client/components/QuillEditor'
import {getComponentByKey} from '../util/jsonDomUtil'
import DomUtil from 'client/util/dom'
import Async from 'client/components/Async'
import CmsViewContainer from '../containers/CmsViewContainer'
import {getKeyValueFromLS} from 'client/util/keyvalue'
import {
    Col,
    Row,
} from 'ui'
import {Link, Redirect} from 'react-router-dom'
import JsonDomInput from './JsonDomInput'
import {deepMergeConcatArrays} from 'util/deepMerge'
import {preprocessCss} from '../util/cssPreprocessor'
import {parseStyles} from 'client/util/style'
import elementWatcher from './elementWatcher'

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


const AdminButton = (props) => <Async {...props} expose="Button"
                                      load={import(/* webpackChunkName: "chat" */ '../../../gensrc/ui/admin')}/>
const AdminSelect = (props) => <Async {...props} expose="Select"
                                      load={import(/* webpackChunkName: "chat" */ '../../../gensrc/ui/admin')}/>
const AdminSwitch = (props) => <Async {...props} expose="Switch"
                                      load={import(/* webpackChunkName: "chat" */ '../../../gensrc/ui/admin')}/>

class JsonDom extends React.Component {

    /* Events that are listened to */
    static events = ['Click', 'KeyDown', 'KeyUp', 'Blur', 'Change', 'Submit', 'Success', 'ContextMenu', 'CustomEvent', 'FileContent', 'Files', 'Input']

    /*
     * Default components
     * new components can be added with the JsonDom hook
     * */
    static components = {
        /* Admin Elements */
        AdminButton,
        AdminSelect,
        AdminSwitch,

        /* Material Design / admin Component */
        DrawerLayout,
        'TypesContainer': (props) => <TypesContainer noLayout={true} title={false}
                                                     baseUrl={location.pathname} {...props}/>,

        /* Default UI Implementation Components */
        Col,
        Row,

        /* Other components */
        FileDrop,
        MarkDown,
        'SmartImage': ({src, options, caption, wrapper, alt,inlineSvg,svgData, ...props}) => {
            let imageData = Util.getImageObject(src, options)
            imageData['data-smartimage'] = true
            const imgTag = props =>{
                if(svgData){
                    return <span data-inline-svg={true} {...props} dangerouslySetInnerHTML={{__html: svgData}}/>
                }else{
                    return <img alt={alt} {...imageData} {...props} />
                }
            }

            if (caption || wrapper) {
                return <figure {...props}>
                    {imgTag()}
                    {caption && <figcaption dangerouslySetInnerHTML={{__html: caption}}/>}
                </figure>
            }
            /*
             <picture>
             <source srcset="mdn-logo-wide.png" media="(min-width: 600px)">
             <img src="mdn-logo-narrow.png" alt="MDN">
             </picture>
             */
            return imgTag(props)
        },
        Print,
        'input': props => {
            if (props.type === 'radio' || !props.name) {
                return <input {...props} />
            }
            return <JsonDomInput {...props} />
        },
        'textarea': (props) => <JsonDomInput textarea={true} {...props}/>,
        'QuillEditor': (props) => <QuillEditor {...props}/>,
        'select': (props) => <JsonDomInput select={true} {...props}/>,
        'Redirect': ({to, push}) => {
            return <Redirect to={{pathname: to}} push={push}/>
        },
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
                        setTimeout(()=> {
                            window.scrollTo({top: 0})
                        },0)
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
            let _props = props
            if (_props && _props.constructor === String) {
                try {
                    _props = JSON.parse(_props)
                } catch (e) {
                    console.log(e)
                }
            }
            if (!rest.slug) {
                return <div>No Slug</div>
            }
            return <CmsViewContainer key={rest.id}
                                     _props={_props}
                                     _parentRef={_this}
                                     fetchPolicy="cache-first"
                                     aboutToChange={_this.props.aboutToChange}
                                     dynamic={true} {...rest}/>
        },
        'ContentEditable': ({_this, onChange, ...props}) => {
            return <ContentEditable
                onChange={(v) => _this.emitChange(props._key, v)} {...props} />
        }
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
    styles = {}

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

        const propsChanged = this.props._props !== props._props || this.props.inlineEditor !== props.inlineEditor
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
            this.props.renewing !== props.renewing

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

            if (slugChanged && this._ismounted) {
                // componentWillUnmount is not triggered for the root JsonDom when it is reused be another component
                // So if the slug has changed and the component is still mounted we have to call unmount
                this.runJsEvent('unmount')
            }

            if (slugChanged || locationChanged || templateChanged || propsChanged || scriptChanged) {
                this.json = this.jsonRaw = null
                this.updateScope = true
            }

            if (this.props.renewing !== props.renewing) {
                this.json = null
            }
            if (slugChanged || scriptChanged || this.runScript) {
                this.removeAddedDomElements(true)
                this.scriptResult = null
                this.runScript = true
            }

            if (resourcesChanged) {
                this.checkResources()
            }


            this.addParentRef(props)

            return true
        } else if (props.editMode && this.props.style !== props.style) {
            this.addStyle(props.style)
        }
        return false
    }

    componentDidCatch(err, info) {
        console.error(err, info)
        this.hasError = true
        this.forceUpdate()
    }

    componentDidMount() {
        this._ismounted = true
        this.node = ReactDOM.findDOMNode(this)


        this.addStyle(this.props.style)

        this.runJsEvent('mount', true)

        let pr = this.props._parentRef
        while (pr) {
            pr.runJsEvent('childmount', false, {id: this.props.id})
            this.checkMetaTags(pr.props)
            if (pr.props._parentRef) {
                pr = pr.props._parentRef
            } else {
                break
            }
        }

        this.checkResources()
        this._historyUnlisten = this.props.history.listen(() => {
            const before = {pathname: this.scope.pathname, params: this.scope.params, hashParams: this.scope.params}
            this.addLocationToScope()
            this.runJsEvent('urlchange', false, before)
        })
        this.moveInHtmlComponents()
        this.checkMetaTags(this.props)
    }

    checkMetaTags(props) {
        if (!props.dynamic && !props.editMode) {
            const meta = document.querySelector('meta[name=description]')
            if (!meta) {
                const content = document.body.innerText.substring(0, 160).replace(/(\r\n|\n|\r)/gm, ' ')
                if (content) {
                    this.addMetaTag('description', content)
                }
            }
        }
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
    componentDidUpdate(prevProps, prevState, snapshot) {
        this._ismounted = true

        if (this.props.style !== prevProps.style) {
            this.addStyle(this.props.style)
        }
        this.runJsEvent('update', true)
        this.moveInHtmlComponents()
    }

    render() {
        const {dynamic, template, script, resolvedData, parseResolvedData, _props, _key, renewing} = this.props
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

                if (parseResolvedData) {
                    // if there are placeholders ${} in the resolvedData String that needs to be parsed with the client scope
                    // the flag parseResolvedData needs to be set to true
                    this.resolvedDataJson = JSON.parse(new Function(DomUtil.toES5(`const Util = this.Util; const {${Object.keys(scope).join(',')}} = this.scope; return \`${resolvedData.replace(/\\/g, '\\\\')}\``)).call({
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
                console.log(e, resolvedData)
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

        if (script) {
            if (this.runScript) {
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
                return <div>Error in beforerender event. See details in console log: <span
                    dangerouslySetInnerHTML={{__html: this.lastEventError}}/></div>
            }
        } else {
            this.jsOnStack = {}
        }
        let content = this.parseRec(this.getJson(this.props), _key ? _key + '-0' : 0, scope)
        if (content && this._inHtmlComponents.length > 0) {
            content = [content, <div key={content.key + '_inHtmlComponents'}>{this._inHtmlComponents}</div>]
        }

        console.log(`render ${this.constructor.name} for ${scope.page.slug} in ${((new Date()).getTime() - startTime)}ms`)
        if (this.parseError) {
            return <div>Error in the template: <strong>{this.parseError.message}</strong></div>
        } else {
            return content
        }
    }

    addStyle(style) {
        const id = 'jsondomstyle' + this.instanceId
        if (style) {
            let parsedStyle
            try {
                parsedStyle = new Function(DomUtil.toES5(`const {scope} = this
                             return \`${style}\``)).call({
                    scope: this.scope,
                    set: (key, value) => {
                        this.styles[key] = value
                        return ''
                    },
                    get: (key) => {
                        return this.styles[key]
                    }
                })
            } catch (e) {
                parsedStyle = style
                console.log(e)
            }


            this.setStyle(parsedStyle, true, id)
        } else {
            const el = document.getElementById(id)

            if (el) {
                el.parentNode.removeChild(el)
            }
        }
    }

    checkResources() {
        // check if all scripts are loaded
        let allloaded = true, counter = 0
        const resources = document.querySelectorAll(`script[data-cms-view="true"]`)
        if (resources) {
            const check = () => {
                counter--
                if (counter === 0) {
                    this.runJsEvent('resourcesready')
                }
            }
            for (let i = 0; i < resources.length; ++i) {
                const resource = resources[i]
                if (!resource.getAttribute('loaded')) {
                    allloaded = false
                    counter++
                    resource.addEventListener('load', check)
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

    removeAddedDomElements(notMainStyle) {
        let butIds
        if (notMainStyle) {
            butIds = ['jsondomstyle' + this.instanceId]
        }
        DomUtil.removeElements(`[data-json-dom-id="${this.instanceId}"]`, butIds)
    }

    handleBindingChange(cb, event, value) {
        const target = event.target
        this.bindings[target.name] = (target.type === 'checkbox' ? target.checked : value || target.value)
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
        if (o) {
            if (o.c && o.c.constructor === String) {
                o.c = value
            } else if (o.$c && o.$c.constructor === String) {
                o.$c = value
            }
            onChange(jsonClone)
        }
    }


    emitJsonError(e, meta) {
        const {onError} = this.props

        if (!onError)
            return

        onError(e, meta)
    }

    parseRec(a, rootKey, scope) {
        if (!a) return null
        if (a.constructor === String) return a
        if (a.constructor === Object) return this.parseRec([a], rootKey, scope)
        if (a.constructor !== Array) return ''
        let h = []
        a.forEach((item, aIdx) => {

                if (!item) return

                const {t, p, c, x, $c, $if, $is, $ifexist, $observe, $for, $loop, $inlineEditor, $set} = item
                /*
                 t = type
                 c = children
                 $c = children as html
                 $if = condition (only parse if condition is fullfilled)
                 p = prop
                 */
                if(t==='#'){
                    // hidden element
                    h.push(this.parseRec(c, rootKey, scope))
                    return
                }
                if ($ifexist) {
                    try {
                        const value = propertyByPath($ifexist, scope)
                        if (value === null || value === undefined) {
                            return
                        }
                    } catch (e) {
                        return
                    }
                }


                if ($is && $is !== 'true') {
                    if( matchExpr($is, scope)){
                        return
                    }
                }

                if ($if) {
                    // check condition --> slower than to check with $ifexist or $is
                    try {
                        const tpl = new Function(`${Object.keys(scope).reduce((str, key) => str + '\nconst ' + key + '=this.scope.' + key, '')};return  ${$if}`)
                        if (!tpl.call({scope})) {
                            return
                        }
                    } catch (e) {
                        console.log(e, scope)
                        return
                    }
                }

                //set
                if ($set && $set.forEach) {
                    $set.forEach(keyvalue => {
                        if (keyvalue.chunk) {
                            scope[keyvalue.key] = Util.chunkArray(keyvalue.value, keyvalue.chunk)
                        } else {
                            scope[keyvalue.key] = keyvalue.value
                        }
                    })
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
                if ($for) {
                    loopOrFor = $for
                } else {
                    loopOrFor = $loop
                }

                if (loopOrFor) {
                    const {$d, d, c} = loopOrFor
                    let data
                    if ($d) {
                        try {
                            // get data from scope by path (foo.bar)
                            data = propertyByPath($d, scope)
                            if( data && data.constructor === String){
                                try {
                                    data = JSON.parse(data)
                                }catch (e) {

                                }
                            }
                        } catch (e) {
                            //this.parseError = e
                            this.emitJsonError(e, {loc: 'Loop Datasrouce'})
                        }
                    } else {
                        if (d && d.constructor === String) {
                            try {
                                data = Function(`${Object.keys(scope).reduce((str, key) => str + '\nconst ' + key + '=this.scope.' + key, '')};const Util = this.Util;return ${d}`).call({
                                    scope,
                                    Util,
                                    serverMethod: (name, args) => {
                                        if (!this.serverMethodMap) {
                                            this.serverMethodMap = {}
                                        }
                                        if (this.serverMethodMap[d]) {
                                            return this.serverMethodMap[d]
                                        }
                                        this.props.serverMethod(name, args, (response) => {
                                            this.serverMethodMap[d] = JSON.parse(response.data.cmsServerMethod.result)
                                            console.log(this.serverMethodMap[d] = JSON.parse(response.data.cmsServerMethod.result))
                                            //this.forceUpdate()
                                        })
                                    }
                                })
                            } catch (e) {
                                if (!loopOrFor.ignore) {
                                    console.log(e, d)
                                    this.emitJsonError(e, {loc: 'Loop Datasource'})
                                }
                            }
                        } else {
                            data = d
                        }
                    }
                    if (!data) return
                    if (data.constructor === Object) {
                        data = Object.keys(data).map((k) => {
                            return {key: k, value: data[k]}
                        })
                    }

                    if (data.constructor !== Array) return
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
                        if ($for) {
                            tpl = new Function(DomUtil.toES5(`const ${s} = this.${s},
                                                    Util = this.Util,
                                                    _i = Util.tryCatch.bind(this),
                                                    _t = this._t.bind(this.scope.data)
                                                    ${loopOrFor.eval ? loopOrFor.eval : ''}
                                                    return \`${cStr}\``))
                        }
                        data.forEach((loopChild, childIdx) => {
                            if (loopOrFor.convert === 'String') {
                                loopChild = Util.escapeForJson(loopChild)
                            }
                            if (!loopChild || loopChild.constructor !== Object) {
                                loopChild = {data: loopChild}
                            }
                            // back to json
                            loopChild._index = childIdx


                            if ($loop) {
                                tpl = new Function(DomUtil.toES5(`const {${Object.keys(loopChild).join(',')}} = this.${s},
                                                    Util = this.Util,
                                                    _i = Util.tryCatch.bind(this),
                                                    _t = this._t.bind(this.scope.data)
                                                    return \`${cStr}\``))
                            }
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

                        this.emitJsonError(ex, {loc: "Loop"})

                        console.log(ex, c)
                        if (ex.message.startsWith('Unexpected token')) {
                            console.error('There is an error in the Json. Try to use Util.escapeForJson')
                        }
                        return
                    }


                } else {

                    const {editMode, location, match, dynamic, history, children} = this.props

                    const key = rootKey + '.' + aIdx, eleProps = {}
                    let tagName, className
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
                        if (editMode && this.props.inlineEditor && !dynamic) {
                            eleProps.tag = tagName
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
                        // remove properties with empty values unless they start with $
                        Object.keys(p).forEach(key => {
                            if (key.startsWith('$')) {
                                p[key.substring(1)] = p[key]
                                delete p[key]
                            } else {
                                p[key] === '' && delete p[key]
                            }
                        })
                        Object.assign(eleProps, p)
                        // replace events with real functions and pass payload
                        JsonDom.events.forEach((e) => {
                            if (eleProps['on' + e] && eleProps['on' + e].constructor === Object) {
                                const payload = eleProps['on' + e]
                                eleProps['on' + e] = (...args) => {
                                    const eLower = e.toLowerCase()
                                    Hook.call('JsonDomUserEvent', {event: eLower, payload, container: this})
                                    this.runJsEvent(eLower, false, payload, ...args)
                                }
                            }
                        })
                        if (eleProps.style && eleProps.style.constructor === String) {
                            //Parses a string of inline styles into a javascript object with casing for react
                            eleProps.style = parseStyles(eleProps.style)
                        }
                        if (eleProps.name && eleProps.binding !== false) {
                            // handle controlled input here
                            if (eleProps.type === 'radio') {
                                if (eleProps.defaultChecked && !this.bindings[eleProps.name]) {
                                    this.bindings[eleProps.name] = eleProps.value
                                }
                            } else {
                                if (eleProps.value === undefined) {
                                    eleProps.value = (eleProps.type === 'checkbox' ? false : '')
                                }
                                if (!this.bindings[eleProps.name]) {
                                    this.bindings[eleProps.name] = eleProps.value
                                } else {
                                    eleProps.value = this.bindings[eleProps.name]
                                }
                                eleProps.time = new Date()
                            }
                            eleProps.onChange = this.handleBindingChange.bind(this, eleProps.onChange)
                        }

                        if (eleProps.props && eleProps.props.$data) {
                            eleProps.props.data = Object.assign(propertyByPath(eleProps.props.$data, scope), eleProps.props.data)
                        }
                    }


                    let eleType = JsonDom.components[tagName] || this.extendedComponents[tagName] || tagName

                    eleProps.key = key

                    if (t === 'Cms') {
                        // if we have a cms component in another cms component the location props gets not refreshed
                        // that's way we pass it directly to the reactElement as a prop
                        eleProps.location = location
                        eleProps.history = history
                        eleProps.match = match
                        eleProps._this = this
                    }
                    if (key.startsWith('inHtmlComponent')) {
                        eleProps._key = key
                    }

                    if (editMode) {
                        eleProps._key = key
                        eleProps._this = this
                        eleProps._editmode = 'true'
                    }
                    if (className) {
                        eleProps.className = className + (eleProps.className ? ' ' + eleProps.className : '')
                    }
                    if (editMode && $inlineEditor !== false) {

                        if (this.props.inlineEditor || ($inlineEditor && $inlineEditor.mode==='source')) {
                            const rawJson = this.getJsonRaw(this.props, true)
                            if (rawJson) {
                                eleProps._json = rawJson
                            }
                        }

                        if (eleProps._json) {
                            eleProps._tagName = tagName
                            eleProps._inlineEditor = this.props.inlineEditor
                            eleProps._options = $inlineEditor || {}
                            eleProps._WrappedComponent = eleType
                            eleProps._scope = scope
                            eleProps._user = this.props.user
                            eleProps._onChange = this.props.onChange
                            eleProps._onDataResolverPropertyChange = this.props.onDataResolverPropertyChange
                            eleType = JsonDomHelper
                        }

                    }
                    if ($c) {
                        eleProps.dangerouslySetInnerHTML = {__html: $c}
                    }

                    if ((( (eleType.name === 'SmartImage' || eleProps.inlineSvg) && eleProps.src && (!$observe || $observe.if !== 'false')) || ($observe && $observe.if !== 'false')) && (!!window.IntersectionObserver || eleProps.inlineSvg)) {

                        h.push(React.createElement(
                            elementWatcher({jsonDom: this, key, scope, tagName, eleType, eleProps, c, $c}, $observe),
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
            }
        )
        return h
    }

    getScope(props) {
        if (this.updateScope) {
            this.updateScope = false

            // set page property
            this.scope.page = {slug: props.slug}
            this.scope.user = props.user
            this.scope.editMode = props.editMode
            this.scope.inEditor = props.inEditor
            this.scope.inlineEditor = props.inlineEditor
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
            this.parseError = e
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
            if (!ignoreError) {
                this.parseError = e
            }
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
                t: 'div.JsonDom-html',
                $c: Util.escapeForJson(str)
            })
        } else if (str.startsWith('{') || str.startsWith('[')) {
            //It is json
            // replace control character
            str = str.replace(/\\/g, '\\\\').replace(/"###/g, '').replace(/###"/g, '')
        } else {
            //Is other
            str = JSON.stringify({
                t: 'MarkDown.JsonDom-markdown',
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
            this.emitJsonError(e, {loc: 'Template'})
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
                        console.log(e)
                        this.lastEventError = this.prettyErrorMessage(e, this.props.script)
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

    prettyErrorMessage = (e, code) => {
        const line = e.stack.split('\n')[1], matches = line.match(/:(\d*):(\d*)/)
        let lineNrStr, column, errorMsg = '<pre style="margin-top:2rem">'

        if (matches && matches.length > 2) {
            lineNrStr = matches[1]
            column = matches[2]
        } else {
            lineNrStr = column = 0
        }
        if (lineNrStr) {
            const lineNr = parseInt(lineNrStr)
            const cbLines = code.split('\n'),
                start = Math.max(0, lineNr - 3),
                end = Math.min(cbLines.length, lineNr + 4)
            for (let i = start; i < end; i++) {

                const str = cbLines[i - 9]
                if (i === lineNr) {
                    errorMsg += `<i style="background:red;color:#fff">Line ${i - 10}: ${e.message}</i>\n<i style="background:yellow">${str}</i>\n`
                } else {
                    errorMsg += str + '\n'
                }
            }
        } else {
            errorMsg += e.message
        }
        errorMsg += '</pre>'
        return errorMsg
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

    setStyle = (style, preprocess, id, inworker) => {
        const addTag = (css) => {
            DomUtil.createAndAddTag('style', 'head', {
                innerHTML: css,
                data: {jsonDomId: this.instanceId},
                id
            })
        }
        if (preprocess) {

            if (inworker) {
                // process in web worker
                Util.createWorker(preprocessCss).run(style).then(e => {
                    addTag(e.data)
                })
            } else {
                addTag(preprocessCss(style))
            }

        } else {
            addTag(style)
        }
    }

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
        } else {
            console.warn(`Component ${id} does not exist`, nodeToRefresh)
        }
    }

}

JsonDom.propTypes = {
    template: PropTypes.string,
    resolvedData: PropTypes.string,
    resources: PropTypes.string,
    script: PropTypes.string,
    style: PropTypes.string,

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
    onChange: PropTypes.func, /* Is fired when the json dom has changed */
    onDataResolverPropertyChange: PropTypes.func, /* Is fired when a property of the dataResolver has changed */
    onError: PropTypes.func,
    onFetchMore: PropTypes.func,

    /* editMode */
    editMode: PropTypes.bool,
    inEditor: PropTypes.bool,
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
    dynamic: PropTypes.bool
}

export default JsonDom
