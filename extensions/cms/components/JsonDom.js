import React from 'react'
import ReactDOM from 'react-dom'
import PropTypes from 'prop-types'
import Hook from 'util/hook.cjs'
import {_t} from 'util/i18n.mjs'
import Util from 'client/util/index.mjs'
import {propertyByPath, matchExpr} from '../../../client/util/json.mjs'
import {scrollByHash} from '../util/urlUtil'
import {getComponentByKey} from '../util/jsonDomUtil'
import DomUtil from 'client/util/dom.mjs'
import Async from 'client/components/Async'
import CmsViewContainer from '../containers/CmsViewContainer'
//import {Link, Redirect} from 'react-router-dom'
import {render} from 'react-dom'
import {Redirect, Link} from 'client/util/route'
import JsonDomInput from './JsonDomInput'
import {deepMerge, deepMergeOptional} from 'util/deepMerge.mjs'
import {preprocessCss} from '../util/cssPreprocessor.mjs'
import {parseStyles} from 'client/util/style'
import ElementWatch from './ElementWatch'
import {CAPABILITY_MANAGE_CMS_TEMPLATE} from '../constants/index.mjs'
import {getKeyValuesFromLS} from '../../../client/util/keyvalue'
import {createManifest} from '../util/manifest.mjs'

const JsonDomHelper = (props) => <Async {...props}
                                        load={import(/* webpackChunkName: "jsondom" */ './JsonDomHelper')}/>

const PrettyErrorMessage = (props) => <Async {...props}
                                             load={import(/* webpackChunkName: "admin" */ './PrettyErrorMessage')}/>

const ContentEditable = (props) => <Async {...props}
                                          load={import(/* webpackChunkName: "admin" */ '../../../client/components/ContentEditable')}/>

const FileDrop = (props) => <Async {...props}
                                   load={import(/* webpackChunkName: "admin" */ '../../../client/components/FileDrop')}/>

const Print = (props) => <Async {...props}
                                load={import(/* webpackChunkName: "admin" */ '../../../client/components/Print')}/>

const QuillEditor = (props) => <Async {...props}
                                      load={import(/* webpackChunkName: "admin" */ '../../../client/components/QuillEditor')}/>

const CodeEditor = (props) => <Async {...props}
                                     load={import(/* webpackChunkName: "codeeditor" */ '../../../client/components/CodeEditor')}/>

const MarkDown = (props) => <Async {...props}
                                   load={import(/* webpackChunkName: "markdown" */ '../../../client/components/MarkDown')}/>

const hasNativeLazyLoadSupport = !_app_.ssr && window.HTMLImageElement && 'loading' in HTMLImageElement.prototype

const SCRIPT_UTIL_PART = ',Util=this.Util,_e=Util.escapeForJson,_i=Util.tryCatch.bind(this),_t=this._t.bind('

class JsonDom extends React.Component {

    /* Events that are listened to */
    static events = ['onDragEnd', 'onDragStart', 'onError','onClose','onRef','onAnimationEnd','onMouseOver', 'onMouseOut', 'onMouseEnter', 'onMouseLeave', 'onMouseDown', 'onMouseUp', 'onClick', 'onKeyDown', 'onKeyUp', 'onFocus', 'onBlur', 'onChange', 'onSubmit', 'onSuccess', 'onContextMenu', 'onCustomEvent', 'onFileContent', 'onFiles', 'onInput', 'onForwardRef']

    /*
     * Default components
     * new components can be added with the JsonDom hook
     * */
    static components = {
        /* Default UI Implementation Components */
        Col: ({className, ...rest}) => {
            return <div className={'col' + (className ? ' ' + className : '')} {...rest} />
        },
        Row: ({className, ...rest}) => {
            return <div className={'row' + (className ? ' ' + className : '')} {...rest} />
        },

        /* Other components */
        FileDrop,
        MarkDown,
        'SmartImage': ({src, options, caption, wrapper, inlineSvg, svgData, tagName, figureStyle, figureClassName, figureCaptionClassName, figureProps, ...props}) => {
            const imgTag = () => {
                let imageData = Util.getImageObject(src, options)
                imageData['data-smartimage'] = true

                if (svgData) {
                    return <span data-inline-svg={true} {...props} dangerouslySetInnerHTML={{__html: svgData}}/>
                } else {
                    const Tag = tagName || 'img'
                    return <Tag {...imageData} {...props} />
                }
            }

            /*TODO remove  figureStyle, figureClassName use figureProps instead */
            if (caption || wrapper) {
                return <figure style={figureStyle} className={figureClassName} {...figureProps}>
                    {imgTag()}
                    {caption && <figcaption className={figureCaptionClassName} dangerouslySetInnerHTML={{__html: caption}}/>}
                </figure>
            }
            return imgTag()
        },
        Print,
        'input': props => {
            const {binding, ...rest} = props
            if (!props.name || binding === false) {
                return <input {...rest} />
            }
            return <JsonDomInput {...rest} />
        },
        'textarea': (props) => <JsonDomInput textarea={true} {...props}/>,
        'QuillEditor': (props) => <QuillEditor {...props}/>,
        'CodeEditor': (props) => <CodeEditor {...props}/>,
        'select': (props) => <JsonDomInput select={true} {...props}/>,
        'Redirect': ({to, push, _this}) => {
            if (_this && Util.hasCapability(_this.props.user, CAPABILITY_MANAGE_CMS_TEMPLATE)) {

                _this.emitJsonError({message: 'Redirect prevented for user'}, {loc: 'Redirect'})
                return null
            } else {
                return <Redirect to={{pathname: Util.removeSlugContext(to)}} push={push}/>
            }
        },
        'Link': ({to, href, target, gotop, native, onClick, tracking, scrollOffset, scrollStep, scrollTimeout, ...rest}) => {
            let url = to || href || ''
            const newTarget = target && target !== 'undefined' ? target : '_self',
                rel = target === '_blank' ? 'noopener' : ''

            let isAbs = url.startsWith('https://') || url.startsWith('http://')

            if (_app_.ssr && !isAbs) {
                isAbs = true
                try {
                    url = new URL(url, location.origin).href
                } catch (e) {
                    console.error(e, url)
                }
            }
            if (tracking) {
                url = location.origin + '/lunucapi/tracking?url=' + encodeURIComponent(url) + tracking
            }

            if (isAbs || native || url.startsWith('tel:') || url.startsWith('mailto:')) {
                return <a href={url} target={newTarget} rel={rel} onClick={(e) => {

                    if (onClick) {
                        onClick(e)
                    }
                }
                } {...rest}/>
            } else {
                url = Util.removeSlugContext(url)

                /*if(url.indexOf(_app_.contextPath + '/') !== 0){
                    url=_app_.contextPath+url
                }*/

                return <Link target={newTarget} rel={rel} onClick={(e) => {

                    if (!url) {
                        e.preventDefault()
                        return false
                    }

                    if (gotop) {
                        setTimeout(() => {
                            window.scrollTo(0, 0)
                        }, 0)
                    } else {
                        scrollByHash(url, {scrollOffset, scrollStep, scrollTimeout})
                    }

                    if (onClick) {
                        onClick(e)
                    }

                }} to={url} {...rest}/>
            }
        },
        'Cms': ({props, _this, style, className, component, slug, ...rest}) => {
            if (!rest.id) {
                console.warn(`There is no id set for included Cms Component ${slug}`, props)
            }

            if(component && component.length > 0){
                slug = component[0].slug
            }

            if (!slug) {
                return <div>No Slug</div>
            }

            let _props = props
            if (_props && _props.constructor === String) {
                try {
                    _props = JSON.parse(_props)
                } catch (e) {
                    console.log(e)
                }
            }
            const cvc = <CmsViewContainer key={rest.id}
                                          slug={slug}
                                          _props={_props}
                                          _parentRef={_this}
                                          fetchPolicy='cache-first'
                                          dynamic={true} {...rest}/>
            if(style || className){
                return <div style={style} className={className}>{cvc}</div>
            }

            return cvc
        },
        'ContentEditable': ({_this, onChange, ...props}) => {
            return <ContentEditable key={props._key}
                                    onChange={(v) => _this.onContentEditableChange(props._key, v)} {...props} />
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

    extendedComponents = {}
    json = null
    jsonRaw = null
    postRender = []
    scope = {}
    updateScope = true
    error = null
    runScript = true
    scriptResult = null
    componentRefs = {} // this is the object with references to elements with identifier
    jsOnStack = {}
    styles = {}
    stopRendering = false

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
        const searchChanged = this.props.location.search !== props.location.search ||
            this.props.location.hash !== props.location.hash

        const scriptChanged = (this.props.script !== props.script)
        const resourcesChanged = (this.props.resources !== props.resources)
        const templateChanged = !props.template || (this.props.template !== props.template)

        const propsChanged = this.props.inlineEditor !== props.inlineEditor || Util.shallowCompare(props._props, this.props._props, {compareArray:true}),
            slugChanged = this.props.slug !== props.slug,
            userChanged = this.props.user !== props.user

        const updateIsNeeded = resolvedDataChanged ||
            searchChanged ||
            scriptChanged ||
            templateChanged ||
            resourcesChanged ||
            propsChanged ||
            slugChanged ||
            userChanged ||
            props.children !== this.props.children ||
            this.props.loading !== props.loading

        if (updateIsNeeded) {

            /*   console.log(`
           for ${props.slug}
               resolvedDataChanged=${resolvedDataChanged}
               searchChanged=${searchChanged}
               scriptChanged=${scriptChanged}
               resourcesChanged=${resourcesChanged}
               templateChanged=${templateChanged}
               propsChanged=${propsChanged}
               slugChanged=${slugChanged}
               childrenChange=${props.children !== this.props.children}
               userChanged=${this.props.user !== props.user }
               loadingChanged=${ this.props.loading !== props.loading}
           `)*/
            // reset parsing error
            this.error = null

            if (resolvedDataChanged) {
                // renew resolved data json
                this.resolvedDataJson = undefined
                this.json = null

            }

            if (slugChanged) {
                this.removeAddedDomElements(props.loading)
                this.bindings = {}
                // componentWillUnmount is not triggered for the root JsonDom when it is reused be another component
                // So if the slug has changed and the component is still mounted we have to call unmount
                this.triggerUnmountEvent()
            }
            if(!props.loading) {
                this.removeAddedDomElements(false,true)
            }
            if (slugChanged || searchChanged || templateChanged || propsChanged || scriptChanged) {
                this.json = this.jsonRaw = null
              //  console.log(props.slug, slugChanged,searchChanged, templateChanged,scriptChanged, props.location.href, this.props.location.href)
                this.updateScope = {renewProps: propsChanged}
            } else if (userChanged) {
                // set new user to scope
                this.scope.user = props.user
            }


            if (this.props.loading !== props.loading) {
                this.json = null
            }
            if (slugChanged || scriptChanged || this.runScript) {
                this.scriptResult = null
                this.runScript = true
                this.jsOnStack = {}
            } else if (propsChanged) {
                this.runJsEvent('propschanged', true, {props: props._props})
            }
            if (resourcesChanged) {
                this.checkResources()
            }


            this.addParentRef(props)

            return true
        } else if (props.editMode && this.props.style !== props.style) {
            this.addStyle(props, true)
        }
        return false
    }

    componentDidCatch(e, info) {
        console.log(e.message, e.stack)
        this.error = {type: 'unknown', e}
        this.forceUpdate()
    }

    componentDidMount() {
        this.addStyle(this.props)
        this.triggerMountEvent()

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
        this._historyUnlisten = this.props.history.listen((e) => {
            const before = {pathname: this.scope.pathname, params: this.scope.params, hashParams: this.scope.params}
            this.addLocationToScope()
            this.runJsEvent('urlchange', false, before)
        })

        this.renderPostRender()
        this.checkMetaTags(this.props)
    }

    componentWillUnmount() {
        console.log(`unmount ${this.props.slug}`)
        if (this._historyUnlisten) {
            this._historyUnlisten()
        }
        this.triggerUnmountEvent()
        this.removeParentRef(this.props)
        this.removeAddedDomElements()
        this.json = this.jsonRaw = this.componentRefs = null
        if (this.node && this.node.oriParent) {
            this.node.oriParent.appendChild(this.node)
        }
    }

    // is called after render
    componentDidUpdate(prevProps, prevState) {
        if (this.props.style !== prevProps.style) {
            this.addStyle(this.props)
        }

        this.triggerMountEvent()
        this.runJsEvent('update', true)
        this.renderPostRender()
    }

    triggerMountEvent() {
        if (!this._ismounted && !this.props.loading) {
            this._ismounted = true
            this.addDynamicManifest()
            setTimeout(() => {
                this.node = ReactDOM.findDOMNode(this)
                this.runJsEvent('mount')
            }, 0)

        }
    }

    triggerUnmountEvent() {
        if (this._ismounted) {
            this._ismounted = false
            this.runJsEvent('unmount')
        }
    }

    addDynamicManifest(){
        if (_app_.ssr || this.props.dynamic || this.props.editMode || document.querySelector('link[rel=manifest]')) {
            return
        }
        const manifest = createManifest()
        this.runJsEvent('manifest', false, {manifest})

        DomUtil.createAndAddTag('link', 'head', {
            rel: 'manifest',
            jsonDomId: this.instanceId,
            href: `data:application/json;base64,${btoa(JSON.stringify(manifest,null,4))}`
        })
    }

    checkMetaTags(props) {
        if (!props.dynamic && !props.editMode) {
            const meta = document.head.querySelector('meta[name=description]')
            if (!meta) {
                let content = ''
                const tags = document.body.querySelectorAll('h1,h2,h3,h4')
                for (let i = 0; i < tags.length; i++) {
                    content += ' ' + tags[i].textContent.trim()
                    if (content.indexOf('.', content.length - 1) === -1) {
                        content += '.'
                    }
                    if (content.length > 150) {
                        break
                    }
                }
                //console.log(content)
                //content = document.body.innerText.substring(0, 160).replace(/(\r\n|\n|\r)/gm, ' ').trim()
                if (content) {
                    this.addMetaTag('description', content.trim())
                } /*else {
                    const observer = new MutationObserver((mutations) => {
                        observer.disconnect()
                        setTimeout(()=> {
                            this.checkMetaTags(props)
                        },0)
                    })
                    observer.observe(document.body, {childList: true, subtree: true})
                }*/
            }
        }
    }

    render() {
        const {template, script, resolvedData, parseResolvedData, _props, _key, loading} = this.props
        if (!template) {
            console.warn('Template is missing.', this.props)
            return null
        }
        const startTime = (new Date()).getTime(),
            scope = this.getScope(this.props)
        let content
        if (!this.error) {
            let isNew = false
            if (this.resolvedDataJson === undefined) {
                isNew = true
                try {
                    if (parseResolvedData) {
                        // if there are placeholders ${} in the resolvedData String that needs to be parsed with the client scope
                        // the flag parseResolvedData needs to be set to true
                        this.resolvedDataJson = JSON.parse(new Function(DomUtil.toES5(`const Util=this.Util;const {${Object.keys(scope).join(',')}}=this.scope;return \`${resolvedData.replace(/\\/g, '\\\\')}\``)).call({
                            scope,
                            Util
                        }))
                    } else {
                        this.resolvedDataJson = JSON.parse(resolvedData)
                    }
                    if (this.resolvedDataJson.error) {
                        this.error = {type: 'dataResolver', msg: this.resolvedDataJson.error}
                    }else{
                        const meta = this.resolvedDataJson._meta
                        if(meta && meta.keyValueExtend){
                            const lsk = getKeyValuesFromLS()
                            if(lsk){
                                this.resolvedDataJson[meta.keyValueKey] = Object.assign({},lsk, this.resolvedDataJson[meta.keyValueKey])
                            }
                        }
                    }
                } catch (e) {
                    console.log(e, resolvedData)
                    this.error = {type: 'dataResolver', e, code: resolvedData}
                }
            }
            if (!this.error) {
                scope.data = this.resolvedDataJson
                if(_props) {
                    scope.props = _props
                }
                scope.dataState = {loading, isNew}


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
                            this.scriptResult = new Function(DomUtil.toES5('\'use strict\';const __this=this._this;' +
                                'const {serverMethod,on,setLocal,getLocal,refresh,getComponent,addMetaTag,setStyle,fetchMore}=__this;' +
                                'const {history,clientQuery,setKeyValue,getKeyValue,updateResolvedData}=__this.props;' +
                                'const {scope,parent,root,Util,DomUtil}=this;' +
                                'const _t=this._t.bind(scope.data),forceUpdate=refresh;' + script)).call({
                                _this: this,
                                scope,
                                Util,
                                DomUtil,
                                Hook,
                                _t,
                                getComponentByKey,
                                root,
                                parent
                            })
                        } catch (e) {
                            this.error = {type: 'script', e, code: script, offset: 9}
                            console.error(e)
                        }
                        scope.script = this.scriptResult || {}
                    }
                    this.runJsEvent('beforerender', false, scope)
                    if(this.stopRendering){
                        console.log(`stop rendering ${scope.page.slug}`)
                        return
                    }
                } else {
                    this.jsOnStack = {}
                }
                content = this.parseRec(this.getJson(this.props), _key ? _key + '-0' : 0, scope)
            }
        }
        console.log(`render ${this.constructor.name} for ${scope.page.slug} in ${((new Date()).getTime() - startTime)}ms`)

        if (this.error) {
            Hook.call('JsonDomError', {error: this.error, slug: scope.page.slug, editMode: this.props.editMode})

            return <div>Error in <strong>{this.error.type}</strong>. See details in console
                log: <PrettyErrorMessage {...this.error}/></div>
        } else {
            return content
        }
    }

    getMainStyleId({uniqueStyle, slug, style}){
        let id = 'jsondomstyle', isUniqueStyle = false, needParsing = style && style.indexOf('${')>=0

        if(uniqueStyle || !needParsing){
            isUniqueStyle = true
            id+=slug
        }else{
            id+=this.instanceId
        }
        return {id, isUniqueStyle, needParsing}
    }

    addStyle(props, styleEdited) {
        let {id, isUniqueStyle, needParsing} = this.getMainStyleId(props)
        if(isUniqueStyle && !styleEdited){
            let styleDom = document.getElementById(id)
            if(styleDom) {

                // add instanceId to data attribute
                const dset = styleDom.dataset
                const ids = dset.jsonDomId.split(' ')
                if (ids.indexOf(this.instanceId+'') < 0) {
                    dset.jsonDomId += ` ${this.instanceId}`
                }
                // style already added
                return
            }
        }
        const {style} = props
        if (style) {
            let parsedStyle
            if (needParsing) {
                try {
                    parsedStyle = new Function(DomUtil.toES5(`const {scope,Util}=this;return \`${style}\``)).call({
                        scope: this.scope,
                        Util: Util,
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
            } else {
                parsedStyle = style
            }
            this.setStyle(parsedStyle, this.props.editMode || !this.props.ssrStyle, id)
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
        const resources = document.head.querySelectorAll(`script[data-cms-view="true"]`)
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
            _parentRef.componentRefs[id] = {comp: this, id: this.instanceId}
        }
    }

    removeParentRef(props) {
        const {id, _parentRef} = props
        if (_parentRef && _parentRef.componentRefs && id && _parentRef.componentRefs[id]) {
            if (_parentRef.componentRefs[id].id === this.instanceId) {
                delete _parentRef.componentRefs[id]
            }
        }
    }

    removeAddedDomElements(isLoading, removeMarked) {
       /* let butIds
        if (notMainStyle) {
            butIds = [this.getMainStyleId(this.props).id]
        }*/
        if(removeMarked && isLoading){
            return
        }
        console.log(`remove dom elements for ${this.props.slug} ${this.instanceId}`, removeMarked, isLoading)
        //DomUtil.removeElements(`[data-json-dom-id="${this.instanceId}"]`)

        // remove instanceId from data attribute
        const els = document.querySelectorAll(`[data-json-dom-id${removeMarked?'-delete':'~'}="${this.instanceId}"]`)
        els.forEach(el=>{
            if(isLoading){
                // mark only for deletion
                el.dataset.jsonDomIdDelete=this.instanceId
            }else {
                const ids = el.dataset.jsonDomId.split(' ')
                const index = ids.indexOf(this.instanceId + '')
                if (index !== -1) {
                    ids.splice(index, 1)
                }
                el.dataset.jsonDomId = ids.join(' ')
                if (ids.length === 0) {
                    el.parentNode.removeChild(el)
                }
            }
        })

    }

    handleBindingChange(cb, event, value) {
        const target = event.target
        this.bindings[target.name] = (target.type === 'checkbox' ? target.checked : value || target.value)
        if (cb) {
            cb.bind(this)(event)
        }

        if (target.type === 'radio') {
            // we need to refresh all radio elements
            this.refresh()
        }
    }

    onSubscription(data) {
        this.runJsEvent('subscription', false, data)
    }

    onContentEditableChange(key, value) {
        const jsonClone = this.getJsonRaw(this.props)
        const o = getComponentByKey(key, jsonClone)
        if (o) {
            if (o.c !== undefined && o.c.constructor === String) {
                o.c = value
            } else if (o.$c != undefined && o.$c.constructor === String) {
                o.$c = value
            }
            this.onTemplateChange(jsonClone)
        }
    }


    onTemplateChange(json, instantSave) {
        const status = {}
        this.runJsEvent('templatechange', false, {json, status})
        if (!status.abort) {
            const {onTemplateChange} = this.props
            if (onTemplateChange) {
                onTemplateChange(json, instantSave)
            }
        }
    }


    emitJsonError(e, data) {
        Hook.call('JsonDomError', {error: {type: data.loc, meta: data.meta, e}, slug: this.props.slug, editMode: this.props.editMode})

        const {onError} = this.props

        if (!onError)
            return

        onError(e, {slug: this.props.slug, ...data})
    }

    parseRec(a, rootKey, scope) {
        if (!a) return null
        if (a.constructor === String) return a
        if (a.constructor === Object) return this.parseRec([a], rootKey, scope)
        if (a.constructor !== Array) return ''
        let h = []
        a.forEach((item, aIdx) => {

                if (!item) return

                const {t, k, p, c, x, $c, $toHtml, $if, $is, $ifexist, $observe, $for, $loop, $inlineEditor, $set} = item
                /*
                 t = type
                 k = key
                 c = children
                 $c = children as html
                 $if = condition (only parse if condition is fullfilled)
                 p = prop
                 */
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

                if ($is === false) {
                    return
                } else if ($is && $is !== true && $is !== 'true') {
                    if ($is === 'false' || matchExpr($is, scope)) {
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

                if (t === '#') {
                    // hidden element
                    if (c) {
                        h.push(this.parseRec(c, rootKey + '.' + aIdx, scope))
                    }
                    return
                }

                //set
                if ($set) {
                    if ($set.constructor === Array) {
                        for (let i = 0; i < $set.length; i++) {
                            const keyvalue = $set[i]
                            if (keyvalue.chunk) {
                                scope[keyvalue.key] = Util.chunkArray(keyvalue.value, keyvalue.chunk, keyvalue.chunkOptions)
                            } else {
                                scope[keyvalue.key] = keyvalue.value
                            }
                        }
                    } else {
                        scope.$set = $set
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
                if ($for) {
                    loopOrFor = $for
                } else {
                    loopOrFor = $loop
                }

                if (loopOrFor) {
                    const {$d, $sort, d, c} = loopOrFor
                    let data
                    if ($d) {
                        try {
                            // get data from scope by path (foo.bar)
                            data = propertyByPath($d, scope)
                            if (data && data.constructor === String) {
                                try {
                                    data = JSON.parse(data)
                                } catch (e) {
                                    console.warn(e)
                                }
                            }
                            if ($sort) {
                                data.sort()
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
                        /* $.loop{ --> ${ */
                        /* "$.loop" --> ${JSON.stringify(this.loop)} the whole loop item */

                        const re = new RegExp('\\$\\.' + s + '{', 'g'),
                            re2 = new RegExp('"' + s + '###|###' + s + '"', 'g'),
                            cStr = JSON.stringify(c).replace(re, '${')
                                .replace('"$.' + s + '"', '${JSON.stringify(this.' + s + ')}')
                                .replace(re2, '')

                        let tpl
                        if ($for) {
                            tpl = new Function(DomUtil.toES5(`const ${s}=this.${s}${SCRIPT_UTIL_PART}this.scope.data);${loopOrFor.eval ? loopOrFor.eval : ''};return \`${cStr}\``))
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
                                tpl = new Function(DomUtil.toES5(`const {${Object.keys(loopChild).join(',')}}=this.${s}${SCRIPT_UTIL_PART}this.scope.data);return \`${cStr}\``))
                            }

                            // remove tabs and parse
                            const json = JSON.parse(tpl.call({
                                [s]: loopChild,
                                scope,
                                Util: Util,
                                _t
                            }).replace(/\t/g, '\\t').replace(/\n/g, '\\n').replace(/\r/g, '\\r'))

                            const key = rootKey + '.' + aIdx + '.$loop.' + childIdx
                            scope[s] = loopChild
                            const com = this.parseRec(json, key, scope)

                            // remove _index
                            delete loopChild._index

                            h.push(com && com.length === 1 ? com[0] : com)
                        })
                    } catch (ex) {

                        this.emitJsonError(ex, {loc: "Loop", meta:{slug: this.props.slug, data}})

                        console.log('------------- ERROR in ' + this.props.slug)
                        console.log(ex, c)
                        if (ex.message.startsWith('Unexpected token')) {
                            console.error('There is an error in the Json. Try to use Util.escapeForJson')
                        }
                        return
                    }


                } else {

                    const {editMode, location, history, children} = this.props
                    const key = !editMode && k ? k : rootKey + '.' + aIdx, eleProps = {}
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
                        if (editMode && this.props.inlineEditor) {
                            eleProps.tag = tagName
                            tagName = 'ContentEditable'
                        }
                    } else {
                        tagName = t
                    }
                    if (tagName.indexOf('$') >= 0) {
                        tagName = 'div'
                    } else if (tagName.indexOf('.') >= 0) {
                        const arr = tagName.split('.')
                        tagName = arr[0]
                        arr.shift()
                        className = arr.join(' ')
                    }


                    if (p) {
                        // remove properties with empty values unless they start with $
                        Object.keys(p).forEach(elKey => {
                            if (elKey === '#') {
                                // ignore
                            } else if (elKey.startsWith('$')) {
                                eleProps[elKey.substring(1)] = p[elKey]
                            } else if (p[elKey] !== '') {
                                if (JsonDom.events.indexOf(elKey) > -1 && p[elKey].constructor === Object) {
                                    // replace events with real functions and pass payload
                                    const payload = p[elKey]

                                    eleProps[elKey] = (...args) => {
                                        const eLower = elKey.substring(2).toLowerCase()
                                        Hook.call('JsonDomUserEvent', {event: eLower, payload, container: this})
                                        this.runJsEvent(eLower, false, payload, ...args, {key})
                                    }
                                } else {

                                    const pos = elKey.indexOf('@')
                                    let curKey
                                    if (pos >= 0) {
                                        //elKey
                                        curKey = elKey.substring(0, pos)
                                    } else {
                                        curKey = elKey
                                    }

                                    let cur = eleProps[curKey]
                                    if (cur) {
                                        if(curKey==='style'){
                                            eleProps[curKey] = Object.assign(parseStyles(cur), parseStyles(p[elKey]))
                                        }else if (cur.constructor === String) {
                                            eleProps[curKey] = cur + p[elKey]
                                        } else if (cur.constructor === Object) {
                                            eleProps[curKey] = Object.assign(cur, p[elKey])
                                        } else {
                                            eleProps[curKey] = p[elKey]
                                        }
                                    } else {
                                        eleProps[curKey] = p[elKey]
                                    }
                                }
                            }
                        })

                        if (eleProps.style && eleProps.style.constructor === String) {
                            //Parses a string of inline styles into a javascript object with casing for react
                            eleProps.style = parseStyles(eleProps.style)
                        }
                        if (eleProps.name && eleProps.binding !== false) {

                            if (eleProps.value === undefined) {

                                if (eleProps.type === 'checkbox') {
                                    eleProps.value = !!eleProps.defaultChecked || !!eleProps.checked
                                } else {
                                    eleProps.value = eleProps.defaultValue || ''
                                }
                            }
                            if (eleProps.type === 'radio') {

                                if (eleProps.value === undefined) {
                                    eleProps.value = eleProps.defaultValue || ''
                                }

                                if (eleProps.defaultChecked || eleProps.checked) {
                                    if (this.bindings[eleProps.name] === undefined) {
                                        this.bindings[eleProps.name] = eleProps.value
                                    }
                                }
                                eleProps.checked = this.bindings[eleProps.name] === eleProps.value

                            } else if (this.bindings[eleProps.name] === undefined) {
                                if (eleProps.value) {
                                    this.bindings[eleProps.name] = eleProps.value
                                }
                            } else {
                                eleProps.value = this.bindings[eleProps.name]
                            }
                            eleProps.time = new Date()

                            eleProps.onChange = this.handleBindingChange.bind(this, eleProps.onChange)
                        }

                        if (eleProps.props && eleProps.props.$data) {
                            eleProps.props.data = Object.assign(propertyByPath(eleProps.props.$data, scope), eleProps.props.data)
                        }
                    }

                    /*if(/[¶|{]/.test(tagName)){
                        this.emitJsonError({message:`Invalid character in tag name ${tagName}`}, {loc: "tagname"})
                        tagName='div'
                    }*/

                    let eleType = JsonDom.components[tagName] || this.extendedComponents[tagName] || tagName

                    eleProps.key = this.props.slug+key
                    if (t === 'Cms') {
                        // if we have a cms component in another cms component the location props gets not refreshed
                        // that's way we pass it directly to the reactElement as a prop
                        eleProps.user = this.props.user
                        eleProps.location = location
                        eleProps.history = history
                        eleProps._this = this
                        eleProps.inEditor = this.props.inEditor
                    }
                    if (key.startsWith('inHtmlComponent')) {
                        eleProps._key = key
                    }

                    if (editMode) {
                        eleProps._rootKey = this.props._key
                        eleProps._key = key
                        eleProps._this = this
                        eleProps._editmode = 'true'
                    }
                    if (className) {
                        eleProps.className = className + (eleProps.className ? ' ' + eleProps.className : '')
                    }
                    if (editMode &&
                        (($inlineEditor !== false && (!$inlineEditor || $inlineEditor.if!=='false')) || _app_.JsonDom.inlineEditor === true) &&
                        _app_.JsonDom.inlineEditor !== false) {

                        if (this.props.inlineEditor || ($inlineEditor && $inlineEditor.mode === 'source')) {
                            eleProps._json = this.getJsonRaw(this.props, true)
                        }

                        if (eleProps._json) {
                            eleProps._dynamic = !this.props.publicEdit && this.props.dynamic
                            eleProps._tagName = tagName
                            eleProps._inlineEditor = this.props.inlineEditor
                            eleProps._options = $inlineEditor || {}
                            eleProps._WrappedComponent = eleType
                            eleProps._scope = scope
                            eleProps._cmsActions = this.props.cmsEditorActions
                            eleProps._onTemplateChange = this.onTemplateChange.bind(this)
                            eleProps._onDataResolverPropertyChange = this.props.onDataResolverPropertyChange
                            eleProps._findSegmentInDataResolverByKeyOrPath = this.props.findSegmentInDataResolverByKeyOrPath
                            eleType = JsonDomHelper
                        }

                    }
                    if ($c || $toHtml) {
                        eleProps.dangerouslySetInnerHTML = {__html: $c || c.replace(/(?:\r\n|\r|\n)/g, '<br>')}
                    }

                    if (_app_.JsonDom.elementWatch != false &&
                        (
                            (
                                ( eleType.name === 'SmartImage' || eleProps.inlineSvg) &&
                                eleProps.src &&
                                (!$observe || $observe.if !== 'false')
                            ) ||
                            ($observe && $observe.if !== 'false')
                        ) &&
                        !(eleProps.loading==='lazy' && hasNativeLazyLoadSupport) &&
                        (!!window.IntersectionObserver || eleProps.inlineSvg)) {



                        h.push(React.createElement(
                            ElementWatch,
                            {
                                jsonDom: this,
                                key: key,
                                _key: key,
                                scope,
                                tagName,
                                eleType,
                                eleProps,
                                c,
                                $c,
                                $observe: $observe || {}
                            }
                        ))
                    } else {
                        h.push(React.createElement(
                            eleType,
                            eleProps,
                            ($c || $toHtml ? null : this.parseRec(c, key, scope))
                        ))
                    }
                }
            }
        )
        return h
    }

    getScope(props) {
        const scope = this.scope
        if (this.updateScope) {
            if(this.updateScope.renewProps){
                delete scope.props
            }
            this.updateScope = false
            scope.page = {slug: props.slug, lang: _app_.lang, title: props.title ? props.title[_app_.lang] : ''}
            scope.user = props.user
            scope.editMode = props.editMode
            scope.inEditor = props.inEditor
            scope.inlineEditor = props.inlineEditor
            scope.dynamic = props.dynamic

            if (props.meta) {
                if (props.meta.constructor === String) {
                    const metaJson = JSON.parse(props.meta)
                    scope.PageOptions = metaJson.PageOptions
                } else {
                    scope.PageOptions = props.meta.PageOptions
                }
            }
            if (!scope.PageOptions) {
                scope.PageOptions = {}
            }

            scope.fetchingMore = false

            // add a refrence to the global app object
            //this.scope._app_ = _app_

            // add a reference of the bindings object
            scope.bindings = this.bindings

            this.addLocationToScope()

        }
        return scope
    }

    addLocationToScope() {
        const loc = window.location
        this.scope.pathname = loc.pathname
        this.scope.params = Util.extractQueryParams()
        this.scope.hashParams = (loc.hash ? Util.extractQueryParams(loc.hash.substring(1), {decodeURI: false}) : {})
    }

    getJson(props) {
        if (this.json) return this.json
        const {template} = props
        const scope = this.getScope(props)
        this.postRender = []
        const renderedTemplate = this.renderTemplate(template, scope)
        try {
            /*
             This is the modified version of the json (placeholder are replaced)
             */
            this.json = JSON.parse(renderedTemplate)
        } catch (e) {
            console.warn('getJson', template, e)
            this.error = {type: 'template', e, code: renderedTemplate}
        }
        if (_app_.ssr && props.style && this.json) {
            // add style
            if (this.json.constructor !== Array) {
                this.json = [this.json]
            }
            this.json.unshift({t: 'style', c: preprocessCss(props.style)})
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
                this.error = {type: 'template', e, code: template}
            }
        }
        return this.jsonRaw
    }


    renderPostRender() {
        // move elements to right place
        for (let i = 0; i < this.postRender.length; i++) {
            const item = this.postRender[i]
            const domElement = document.getElementById(item.id)
            if(domElement){
                render(
                    this.parseRec(item.component, item.id, this.scope),
                    domElement
                )
            }
        }
    }

    renderTemplate(str, scope) {
        str = str.trim()
        // Simple content type detection
        if (str.indexOf('<') == 0) {
            //It is html
            str = JSON.stringify({
                t: 'div.JsonDom-html',
                $c: Util.escapeForJson(str)
            })
        } else if (str.indexOf('{') == 0 || str.indexOf('[') == 0) {
            //It is json
            // replace control character
            str = str.replace(/\\/g, '\\\\').replace(/"###|###"/g, '')
        } else {
            //Is other
            str = JSON.stringify({
                t: 'MarkDown.JsonDom-markdown',
                c: Util.escapeForJson(str)
            }).replace(/\`/g, '\\`')
        }
        try {
            // Scope properties get destructed so they can be accessed directly by property name
            return new Function(DomUtil.toES5(`const {${Object.keys(scope).join(',')}}=this.scope${SCRIPT_UTIL_PART}data),_r=this.addToPostRender;return \`${str}\``)).call({
                scope,
                parent: this.props._parentRef,
                Util,
                _t,
                // expose some attributes
                addToPostRender: this.addToPostRender,
                serverMethod: this.serverMethod,
                props: this.props
            }).replace(/\t/g, '\\t')

        } catch (e) {
            this.emitJsonError(e, {loc: 'Template'})
            console.error('Error in renderTemplate', e)
            console.log(str)
            return str
        }
    }

    runJsEvent(name, async, ...args) {
        let finalArgs
        if (args.length) {
            finalArgs = args[0]
        } else {
            finalArgs = {}
        }
        let t = this.jsOnStack[name]
        if (!t && finalArgs._forceUpdate) {
            // create dummy event
            t = [() => {
            }]
        }
        const results = []
        if (t && t.length && !this.error) {
            for (let i = 0; i < t.length; i++) {
                const cb = t[i]
                if (cb) {
                    const callCb = () => {
                        if (finalArgs._forceUpdate) {
                            // call with little delay because onClick is triggered before onChange
                            setTimeout(() => {
                                this.refresh()
                            }, 0)
                        } else {
                            try {
                                results.push(cb(...args))
                            } catch (e) {
                                console.log(e, cb)
                                this.error = {type: `script event ${name}`, e, code: this.props.script, offset: 9}
                                if (async) {
                                    this.forceUpdate()
                                }
                            }
                        }
                    }

                    if (async) {
                        setTimeout(callCb, 0)
                    } else {
                        callCb()
                    }

                }
            }
        }
        // pass event to components
        if (finalArgs._passEvent) {
            const parentRef = this.props._parentRef
            if (finalArgs._passEvent == 'all') {
                // to all components
                const comps = this.getAllComponents()
                const keys = Object.keys(comps)
                const newArgs = args.slice(0)
                newArgs[0] = Object.assign({}, newArgs[0], {_passEvent: false})
                for (let i = 0; i < keys.length; i++) {
                    const o = comps[keys[i]]
                    if (o.comp !== this) {
                        results.push(...o.comp.runJsEvent(name, async, ...newArgs))
                    }
                }
            } else if (parentRef) {
                // to parents only
                results.push(...parentRef.runJsEvent(name, async, ...args))
            }
        }
        return results
    }


    fetchMore = (callback, options={}) => {
        const scope = this.getScope(this.props)
        if (scope.fetchingMore || !this._ismounted) {
            return
        }
        if (!scope.params.page) {
            scope.params.page = !isNaN(scope.data.page)?scope.data.page:1
        }

        scope.params.page = parseInt(scope.params.page) + 1

        scope.fetchingMore = true
        if(options.parseTemplate) {
            this.json = null
        }
        this.forceUpdate()

        let query = ''
        const keys = Object.keys(scope.params)
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i]
            if (query) query += '&'
            query += `${key}=${scope.params[key]}`
        }

        let meta
        if (options.meta) {
            meta = options.meta
        }

        this.props.onFetchMore({query, meta}, (res) => {
            if (res.cmsPage && res.cmsPage.resolvedData) {
                const newData = JSON.parse(res.cmsPage.resolvedData)
                if(options.ignoreKeys){
                    options.ignoreKeys.forEach(key=>{
                        delete newData[key]
                    })
                }
                this.resolvedDataJson = deepMergeOptional({concatArrays: true}, this.resolvedDataJson, newData)

                scope.fetchingMore = false

                if (this._ismounted) {
                    if(options.parseTemplate){
                        this.json = null
                    }
                    this.props.updateResolvedData({json: this.resolvedDataJson})
                    this.forceUpdate()
                }
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


    addToPostRender = (component) => {
        const id = 'inHtmlComponent' + this.postRender.length
        this.postRender.push({component, id})
        return `<div id='${id}'></div>`
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
        if (_app_.noStorage || typeof localStorage === 'undefined') return def
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
        if (!_app_.noStorage && typeof localStorage !== 'undefined') {
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
    getAllComponents = () => {
        const jsGetComponentRec = (comp, data) => {
            if (comp && comp.componentRefs) {
                Object.assign(data, comp.componentRefs)
                const keys = Object.keys(comp.componentRefs)
                for (let i = 0; i < keys.length; i++) {
                    jsGetComponentRec(comp.componentRefs[keys[i]].comp, data)
                }

            }
            return data
        }
        const root = this.getRootComponent()
        const data = {root:{comp:root,id:root.instanceId}}
        jsGetComponentRec(root, data)
        return data
    }
    getComponent = (id) => {
        if (id) {
            const comps = this.getAllComponents()

            if (comps[id]) {
                return comps[id].comp
            }
        }
        return null
    }

    setStyle = (style, preprocess, id) => {
        const addTag = (css) => {
            DomUtil.createAndAddTag('style', 'head', {
                textContent: css,
                data: {jsonDomId: this.instanceId, jsonDomIdDelete: undefined},
                id
            })
        }
        if (preprocess) {

           /* if (inworker) {
                // process in web worker
                Util.createWorker(preprocessCss).run(style).then(e => {
                    addTag(e.data)
                })
            } else {*/
                addTag(preprocessCss(style))
           /* }*/

        } else {
            addTag(style)
        }
    }

    addMetaTag = (name, content) => {

        let attr
        if (name.constructor !== Object) {
            attr = {name, content}
        } else {
            attr = name
        }
        attr.data = {jsonDomId: this.instanceId}


        DomUtil.createAndAddTag('meta', 'head', attr)
    }

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
            nodeToRefresh.json = null
            if (runScript) {
                nodeToRefresh.runScript = true
            }
            if (!nodeToRefresh._ismounted) {
                console.warn(`Component ${id} is not mounted`, nodeToRefresh)
                return false
            }
            nodeToRefresh.forceUpdate()
        } else {
            console.warn(`Component ${id} does not exist`, nodeToRefresh)
        }
    }

    reload = props => {
        setTimeout(()=> {

            this.props.refetch({_props:deepMerge({$: {}}, this.scope.props, props)})
           /* _app_.dispatcher.dispatch({
                type: 'CMS_RENDER',
                payload:{
                    props: deepMerge({$: {}}, this.scope.props, props),
                    slug: this.props.slug,
                    id: this.props.id
                }
            })*/

        },0)
    }

    show404 = () =>{
        this.stopRendering = true
        window.location.href = _app_.redirect404
    }

}

JsonDom.propTypes = {
    template: PropTypes.string,
    meta: PropTypes.any,
    resolvedData: PropTypes.string,
    resources: PropTypes.string,
    script: PropTypes.string,
    style: PropTypes.string,
    unqiueStyle: PropTypes.bool,

    slug: PropTypes.string,
    user: PropTypes.object,

    /* states */
    loading: PropTypes.bool,

    /* Methods */
    setKeyValue: PropTypes.func,
    getKeyValue: PropTypes.func,
    updateResolvedData: PropTypes.func,
    serverMethod: PropTypes.func,
    clientQuery: PropTypes.func,
    subscriptionCallback: PropTypes.func,
    onTemplateChange: PropTypes.func, /* Is fired when the json dom has changed */
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

    children: PropTypes.any,
    id: PropTypes.string,
    /* if dynamic is set to true that means it is a child of another JsonDom */
    dynamic: PropTypes.bool
}


export default JsonDom
