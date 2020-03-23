import React from 'react'
import ReactDOM from 'react-dom'
import PropTypes from 'prop-types'
import {withStyles} from 'ui/admin'
import * as CmsActions from '../actions/CmsAction'
import {bindActionCreators} from 'redux'
import {connect} from 'react-redux'
import {
    SimpleSelect,
    SimpleDialog,
    SimpleMenu,
    EditIcon,
    LaunchIcon,
    DeleteIcon,
    AddIcon,
    BuildIcon,
    ImageIcon,
    FileCopyIcon,
    PlaylistAddIcon
} from 'ui/admin'
import GenericForm from 'client/components/GenericForm'
import classNames from 'classnames'
import AddToBody from './AddToBody'
import DomUtil from 'client/util/dom'
import Util from 'client/util'
import {propertyByPath, setPropertyByPath} from '../../../client/util/json'
import {getComponentByKey, addComponent, removeComponent, getParentKey, isTargetAbove} from '../util/jsonDomUtil'
import config from 'gen/config'
import {getJsonDomElements} from '../util/elements'
import {ApolloClient} from 'apollo-client'
import {withApollo} from 'react-apollo'
import gql from 'graphql-tag'

const {UPLOAD_URL} = config


const styles = theme => ({
    wrapper: {},
    highlighter: {
        zIndex: 999,
        position: 'fixed',
        bottom: 0,
        left: 0,
        minWidth: '10px',
        minHeight: '10px',
        display: 'flex',
        border: '1px dashed rgba(0,0,0,0.3)',
        pointerEvents: 'none',
        justifyContent: 'center',
        alignItems: 'center'
    },
    bgYellow: {
        background: 'rgba(245, 245, 66,0.05)',
    },
    bgBlue: {
        background: 'rgba(84, 66, 245,0.1)',
        color: 'black',
        fontWeight: 'bold',
        fontSize: '0.9rem',
        textShadow:'1px 1px 2px white'
    },
    dropArea: {
        display: 'none',
        borderRadius: '10px',
        background: '#fff',
        margin: '0px',
        border: '1px dashed #c1c1c1',
        height: '30px',
        lineHeight: '30px',
        color: '#c1c1c1',
        textAlign: 'center',
        fontSize: '0.8rem',
        fontWeight: 'normal'
    },
    dropAreaOver: {
        background: 'rgba(255, 0, 0, 0.2)',
        borderColor: 'red',
    },
    toolbar: {
        zIndex: 999,
        position: 'fixed',
        maxHeight: '200px'
    },
    toolbarHovered: {},
    rootToolbar: {
        position: 'absolute'
    },
    picker: {
        cursor: 'pointer',
        pointerEvents: 'auto'
    },
    toolbarMenu: {
        position: 'absolute',
        left: '-2.2rem',
        top: 'calc(50% - 1.5rem)'
    },
    info: {
        position: 'fixed',
        bottom: '0px',
        right: '0px',
        background: '#fff',
        padding: '3px',
        zIndex: 99999
    }
})

const ALLOW_DROP = ['div', 'main', 'Col', 'Row']
const ALLOW_DROP_IN = {'Col': ['Row'], 'li': ['ul']}
const ALLOW_DROP_FROM = {'Row': ['Col']}
const ALLOW_CHILDREN = ['div', 'main', 'ul', 'Col']

let aftershockTimeout
const highlighterHandler = (e, observer, after) => {
    const hightlighter = document.querySelector('[data-highlighter]')
    if (hightlighter) {
        const key = hightlighter.getAttribute('data-highlighter')
        const node = document.querySelector('[_key="' + key + '"]')

        if (node) {
            const offset = DomUtil.elemOffset(node)
            hightlighter.style.top = offset.top + 'px'
            hightlighter.style.left = offset.left + 'px'
            hightlighter.style.width = node.offsetWidth + 'px'
            hightlighter.style.height = node.offsetHeight + 'px'


            const toolbar = document.querySelector('[data-toolbar="' + key + '"]')
            if (toolbar) {
                toolbar.style.top = offset.top + 'px'
                toolbar.style.left = offset.left + 'px'
                toolbar.style.height = node.offsetHeight + 'px'
            }

        }
    }
    if (!after) {
        clearTimeout(aftershockTimeout)
        aftershockTimeout = setTimeout(() => {
            highlighterHandler(e, observer, true)
        }, 100)
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Alt') {
        JsonDomHelper.altKeyDown = true
    }
})
document.addEventListener('keyup', (e) => {
    if (e.key === 'Alt') {
        JsonDomHelper.altKeyDown = false
    }
})

document.addEventListener('scroll', highlighterHandler)


class JsonDomHelper extends React.Component {
    static currentDragElement
    static disableEvents = false
    static altKeyDown = false
    static mutationObserver = false

    state = {
        hovered: false,
        top: 0,
        left: 0,
        height: 0,
        width: 0,
        toolbarHovered: false,
        dragging: false,
        toolbarMenuOpen: false,
        addChildDialog: null,
        deleteConfirmDialog: false
    }

    constructor(props) {
        super(props)
    }

    componentDidMount() {
        if (!JsonDomHelper.mutationObserver) {
            JsonDomHelper.mutationObserver = new MutationObserver(highlighterHandler)

        }
        JsonDomHelper.mutationObserver.observe(document.querySelector('[data-layout-content]'), {
            attributes: false,
            childList: true,
            characterData: true,
            subtree: true
        })

    }

    shouldComponentUpdate(props, state) {
        if (JsonDomHelper.currentDragElement && JsonDomHelper.currentDragElement != this) {
            return false
        }
        return props.dangerouslySetInnerHTML !== this.props.dangerouslySetInnerHTML ||
            props._json !== this.props._json ||
            props.children !== this.props.children ||
            state.hovered !== this.state.hovered ||
            state.addChildDialog !== this.state.addChildDialog ||
            state.deleteConfirmDialog !== this.state.deleteConfirmDialog ||
            state.deleteSourceConfirmDialog !== this.state.deleteSourceConfirmDialog ||
            state.dragging !== this.state.dragging ||
            state.top !== this.state.top ||
            state.left !== this.state.left ||
            state.height !== this.state.height ||
            state.width !== this.state.width ||
            state.toolbarHovered !== this.state.toolbarHovered
        state.mouseX !== this.state.mouseX
    }

    helperTimeoutOut = null
    helperTimeoutIn = null

    onHelperMouseOver(e) {
        if (JsonDomHelper.disableEvents || JsonDomHelper.altKeyDown)
            return
        e.stopPropagation()
        const {hovered, dragging} = this.state

        // take this node instead of e.target becuase it might be a child of it
        const node = ReactDOM.findDOMNode(this)
        if (dragging) {
            return
        }
        clearTimeout(this.helperTimeoutOut)
        clearTimeout(this.helperTimeoutIn)

        if (!hovered) {
            const stat = {
                hovered: true,
                height: node.offsetHeight,
                width: node.offsetWidth, ...DomUtil.elemOffset(node)
            }
            this.helperTimeoutIn = setTimeout(() => {
                this.setState(stat)
            }, 80)
        }

    }

    onHelperMouseOut(e) {
        if (e) {
            e.stopPropagation()
        }
        if (JsonDomHelper.altKeyDown) {
            setTimeout(() => {
                this.onHelperMouseOut()
            }, 100)
            return
        }
        const {hovered, dragging} = this.state

        if (dragging) {
            return
        }

        if (hovered) {
            this.helperTimeoutOut = setTimeout(() => {
                this.setState({hovered: false})
            }, 100)
        } else {
            clearTimeout(this.helperTimeoutIn)
        }
    }


    onToolbarMouseOver(e) {
        if (JsonDomHelper.disableEvents)
            return
        e.stopPropagation()

        const {toolbarMenuOpen} = this.state

        if (!toolbarMenuOpen) {
            this.setState({toolbarHovered: true})
        }
    }

    onToolbarMouseOut(className, e) {
        e.stopPropagation()

        if (!this.state.toolbarMenuOpen) {
            let el = e.toElement || e.relatedTarget
            while (el && el.parentNode && el.parentNode != window) {
                if (el.classList.contains(className)) {
                    e.preventDefault()
                    e.stopPropagation()
                    return false
                }
                el = el.parentNode
            }
            setTimeout(() => {
                this.setState({toolbarHovered: false})
            }, 100)
        }
    }

    onDragStart(e) {
        e.stopPropagation()
        if (!JsonDomHelper.currentDragElement) {
            JsonDomHelper.currentDragElement = this
            this.setState({toolbarHovered: false, hovered: false, dragging: true})
        }
        //DomUtil.setAttrForSelector('.'+classes.dropArea, {style:'display:block'})

    }

    _clientY = 0
    _clientX = 0
    _onDragTimeout = 0

    onDrag(e) {
        e.stopPropagation()
        if (Math.abs(e.clientY - this._clientY) > 10) {

            this._clientX = e.clientX
            this._clientY = e.clientY
            clearTimeout(this._onDragTimeout)

            const draggable = ReactDOM.findDOMNode(JsonDomHelper.currentDragElement)
            this._onDragTimeout = setTimeout(() => {

                /*if( !JsonDomHelper.currentDragElement ){
                 return
                 }*/
                const tags = document.querySelectorAll('.' + this.props.classes.dropArea)

                const fromTagName = JsonDomHelper.currentDragElement?JsonDomHelper.currentDragElement.props._tagName:'',
                    allowDropIn = ALLOW_DROP_IN[fromTagName]

                for (let i = 0; i < tags.length; ++i) {
                    const tag = tags[i]
                    if (draggable === tag.nextSibling || draggable === tag.previousSibling) {
                        tag.style.display = 'none'
                        continue
                    }

                    let node

                    if (tag.nextSibling) {
                        node = tag.nextSibling
                    } else if (tag.previousSibling) {
                        node = tag.previousSibling
                    } else {
                        node = tag.parentNode
                    }

                    if (node.nodeType !== Node.TEXT_NODE && JsonDomHelper.currentDragElement) {
                        const tagName = tag.getAttribute('data-tag-name')
                        if (!allowDropIn || allowDropIn.indexOf(tagName) >= 0) {

                            const allowDropFrom = ALLOW_DROP_FROM[tagName]
                            if (!allowDropFrom || allowDropFrom.indexOf(fromTagName) >= 0) {
                                const pos = DomUtil.elemOffset(node)
                                const distanceTop = Math.abs(this._clientY - (pos.top))
                                const distanceMiddle = Math.abs(this._clientY - (pos.top + node.offsetHeight / 2))
                                const distanceBottom = Math.abs(this._clientY - (pos.top + node.offsetHeight))
                                if (distanceTop < 100 || distanceMiddle < 100 || distanceBottom < 100) {
                                    tag.style.display = 'block'
                                } else {
                                    if (distanceTop > 250 && distanceMiddle > 250 && distanceBottom > 250)
                                        tag.style.display = 'none'
                                }
                            }
                        }
                    }
                }
            }, 50) // prevent flickering
        }
    }

    onDragEnd(e) {
        e.stopPropagation()
        this.resetDragState()
    }

    onDragEnterDropArea(e) {
        e.stopPropagation()
        e.preventDefault()
        e.currentTarget.classList.add(this.props.classes.dropAreaOver)
    }

    onDragOverDropArea(e) {
        e.stopPropagation()
        e.preventDefault()
    }

    onDragLeaveDropArea(e) {
        e.stopPropagation()
        e.currentTarget.classList.remove(this.props.classes.dropAreaOver)
    }

    onDrop(e) {
        e.stopPropagation()
        e.preventDefault()

        const {classes, _json, _onChange} = this.props
        e.currentTarget.classList.remove(classes.dropAreaOver)

        let sourceKey = JsonDomHelper.currentDragElement.props._key,
            sourceIndex = parseInt(sourceKey.substring(sourceKey.lastIndexOf('.') + 1)),
            sourceParentKey = getParentKey(sourceKey),
            targetKey = e.currentTarget.getAttribute('data-key'),
            targetIndex = parseInt(e.currentTarget.getAttribute('data-index'))


        // 1. get element from json structure by key
        const source = getComponentByKey(sourceKey, _json)

        if(source) {
            if (isTargetAbove(sourceKey, targetKey + '.' + targetIndex)) {
                //2. remove it from json
                if (removeComponent(sourceKey, _json)) {

                    // 3. add it to new position
                    addComponent({key: targetKey, json: _json, index: targetIndex, component: source})

                    _onChange(_json)

                }
            } else {
                addComponent({key: targetKey, json: _json, index: targetIndex, component: source})
                removeComponent(sourceKey, _json)
            }
            _onChange(_json)
        }


        this.resetDragState()
    }


    resetDragState() {
        console.log('.' + this.props.classes.dropArea)
        DomUtil.setAttrForSelector('.' + this.props.classes.dropArea, {style: 'display:none'})
        JsonDomHelper.currentDragElement = null
        this.setState({toolbarHovered: false, hovered: false, dragging: false})
    }


    handleEditClick(e) {
        e.stopPropagation()
        e.preventDefault()
        const {_cmsActions, _key, _json, _scope} = this.props

        _cmsActions.editCmsComponent(_key, _json, _scope)

    }

    handleCopyClick(e) {
        e.stopPropagation()
        e.preventDefault()
        const {_cmsActions, _onChange, _key, _json, _scope} = this.props

        const source = getComponentByKey(_key, _json)

        if (source) {
            const key = getParentKey(_key)
            let index = parseInt(_key.substring(_key.lastIndexOf('.')+1))
            if( isNaN(index)){
                index = -1
            }else{
                index++
            }
            addComponent({key, json: _json, index, component: source})
            _onChange(_json)
        }

    }


    handleEditDataClick(e, clone) {
        e.stopPropagation()
        e.preventDefault()
        const {_cmsActions, _inlineEditor} = this.props

        const dataSource = this.parseInlineEditorSource(_inlineEditor.source)
        if( clone ){
            dataSource.clone = true
        }
        _cmsActions.editCmsData(dataSource)

    }

    parseInlineEditorSource(source) {
        let parsedSource
        if (source && source.constructor === String) {
            const pos = source.indexOf(':'), pos2 = source.indexOf(':', pos + 1)

            const type = source.substring(0, pos),
                _id = source.substring(pos + 1, pos2 >= 0 ? pos2 : source.length)

            const parts = source.split(':')
            if (parts.length >= 2) {
                parsedSource = {type, _id, props: pos2 >= 0 ? source.substring(pos2 + 1) : null}
            }
        } else {
            parsedSource = source
        }
        return parsedSource
    }

    handleAddChildClick(component, index) {
        const {_key, _json, _onChange, _onDataResolverPropertyChange} = this.props

        let newkey = _key
        if (index !== undefined) {
            newkey = newkey.substring(0, newkey.lastIndexOf('.'))
        } else {
            index = 0
        }
        if (component.$inlineEditor && component.$inlineEditor.dataResolver) {
            let dataResolver = component.$inlineEditor.dataResolver

            if (dataResolver.constructor === String) {
                console.log(dataResolver)
                dataResolver = JSON.parse(dataResolver)
            }

            // replace with key only
            component.$inlineEditor.dataResolver = dataResolver.key

            console.log(dataResolver)

            _onDataResolverPropertyChange({value: dataResolver, key: dataResolver.key, instantSave: true})

        }
        addComponent({key: newkey, json: _json, index, component})
        _onChange(_json)
    }


    handleDeleteClick(e) {
        const {_cmsActions, _key, _json, _scope, _onChange, _onDataResolverPropertyChange} = this.props
        const source = getComponentByKey(_key, _json)

        if (source && source.$inlineEditor && source.$inlineEditor.dataResolver) {
            _onDataResolverPropertyChange({value: null, key: source.$inlineEditor.dataResolver})
        }
        removeComponent(_key, _json)
        _onChange(_json)
    }


    getDropArea(rest, index) {
        return <div
            onMouseOver={(e) => {
                e.stopPropagation()
            }}
            onDragEnter={this.onDragEnterDropArea.bind(this)}
            onDragOver={this.onDragOverDropArea.bind(this)}
            onDragLeave={this.onDragLeaveDropArea.bind(this)}
            onDrop={this.onDrop.bind(this)}
            data-key={rest._key}
            data-index={index}
            data-tag-name={rest._tagName}
            key={`${rest._key}.dropArea.${index}`}
            className={this.props.classes.dropArea}>Hier plazieren</div>
    }

    openPicker(picker) {
        const {_onChange, _key, _json} = this.props

        const w = screen.width / 3 * 2, h = screen.height / 3 * 2,
            left = (screen.width / 2) - (w / 2), top = (screen.height / 2) - (h / 2)

        const newwindow = window.open(
            `/admin/types/?noLayout=true&fixType=${picker.type}&baseFilter=${encodeURIComponent(picker.baseFilter || '')}`, '_blank',
            'toolbar=no, location=no, directories=no, status=no, menubar=no, scrollbars=no, resizable=yes, copyhistory=no, width=' + w + ', height=' + h + ', top=' + top + ', left=' + left)
            setTimeout(()=> {
                newwindow.addEventListener('beforeunload', (e) => {
                    if (newwindow.resultValue) {
                        //_cmsActions.editCmsComponent(rest._key, _json, _scope)
                        const source = getComponentByKey(_key, _json)
                        if (source) {
                            if (picker.template) {
                                source.$c = Util.replacePlaceholders(picker.template.replace(/\\\{/g, '{'), newwindow.resultValue)
                            } else {
                                if (!source.p) {
                                    source.p = {}
                                }
                                source.p.src = newwindow.resultValue
                            }
                            setTimeout(() => {
                                _onChange(_json)
                            }, 0)
                        }
                    }
                    delete e['returnValue']
                })
            },500)
    }

    setFormOptionsByProperties(json, options, prefix) {

        Object.keys(json).forEach(key => {
            const newKey = prefix + key, value = propertyByPath(key, json, '_')

            if( !options[newKey] ) {
                if (value && value.constructor === Object) {
                    this.setFormOptionsByProperties(value, options, newKey + '_')
                } else {
                    options[newKey] = {
                        label: key,
                        value,
                        type: value === true || value === false ? 'Boolean' : 'String'
                    }
                }
            }
        })
    }

    render() {
        const {classes, _WrappedComponent, _json, _cmsActions, _onChange, _onDataResolverPropertyChange, children, _tagName, _inlineEditor, onChange, ...rest} = this.props
        const {hovered, toolbarHovered, toolbarMenuOpen, addChildDialog, deleteConfirmDialog, deleteSourceConfirmDialog} = this.state

        const menuItems = []

        const events = {
            onMouseOver: this.onHelperMouseOver.bind(this),
            onMouseOut: this.onHelperMouseOut.bind(this),
            onContextMenu: (e) => {
                e.preventDefault()
                e.stopPropagation()

                if(menuItems.length>0 ) {
                    this.setState({
                        toolbarMenuOpen: true,
                        toolbarHovered: true,
                        mouseX: e.clientX - 2,
                        mouseY: e.clientY - 4
                    })
                }
            }
        }
        let isTempalteEdit = !!_json, subJson, toolbar, highlighter, dropAreaAbove, dropAreaBelow, newOnChange

        const isLoop = rest._key.indexOf('$loop') >= 0
        const isCms = _tagName === 'Cms'


        if (_inlineEditor.allowDrop === undefined) {
            _inlineEditor.allowDrop = ALLOW_DROP.indexOf(_tagName) >= 0 && !this.props.dangerouslySetInnerHTML
        }
        if (!_inlineEditor.menu) {
            _inlineEditor.menu = {}
        }
        if (!_inlineEditor.menuTitle) {
            _inlineEditor.menuTitle = {}
        }

        if (isTempalteEdit) {
            subJson = getComponentByKey(rest._key, _json)

            if (!subJson) {
                isTempalteEdit = false
            }
        }

        const isDraggable = !isLoop && isTempalteEdit && _inlineEditor.allowDrag!== false

        if (isDraggable) {
            events.draggable = 'true'
            events.onDragEnd = this.onDragEnd.bind(this)
            events.onDrag = this.onDrag.bind(this)
            events.onDrop = this.onDrop.bind(this)
        }

        events.onDragStart = e=>{
            if( isDraggable ) {
                this.onDragStart(e)
            }else{
                e.stopPropagation()
            }
        }


        if (!JsonDomHelper.disableEvents && (hovered || toolbarHovered || toolbarMenuOpen)) {

            if (isCms) {
                menuItems.push({
                    name: `Komponente ${subJson.p && subJson.p.id} öffnen`, icon: <LaunchIcon/>, onClick: () => {
                        window.location = '/' + subJson.p.slug
                    }
                })
            }

            if (isTempalteEdit) {


                const parsedSouce = this.parseInlineEditorSource(_inlineEditor.source)
                if (parsedSouce) {

                    if (_onDataResolverPropertyChange) {
                        newOnChange = (e, ...args) => {
                            _onDataResolverPropertyChange({value: e.target.value, path: parsedSouce._id})
                            onChange(e, ...args)
                        }

                    }
                    menuItems.push({
                        name: _inlineEditor.menuTitle.source || 'Datenquelle bearbeiten',
                        icon: <EditIcon/>,
                        onClick: this.handleEditDataClick.bind(this)
                    })

                    if( parsedSouce.allowClone ) {
                        menuItems.push({
                            name: _inlineEditor.menuTitle.sourceClone || 'Datenquelle kopieren',
                            icon: <FileCopyIcon/>,
                            onClick: (e)=>{
                                this.handleEditDataClick(e, true)
                            }
                        })
                    }


                    if( parsedSouce.allowRemove ) {
                        menuItems.push({
                            name: _inlineEditor.menuTitle.sourceRemove || 'Datenquelle löschen',
                            icon: <DeleteIcon/>,
                            onClick: (e)=>{

                                this.setState({deleteSourceConfirmDialog: parsedSouce})
                            }
                        })
                    }
                }

                if (_inlineEditor.elementKey) {
                    const jsonElement = getJsonDomElements(_inlineEditor.elementKey)

                    if (jsonElement && (isCms || jsonElement.options)) {

                        menuItems.push({
                            name: 'Bearbeiten',
                            icon: <EditIcon/>,
                            onClick: () => {
                                JsonDomHelper.disableEvents = true

                                //clone
                                const newJsonElement = JSON.parse(JSON.stringify(jsonElement))
                                delete newJsonElement.defaults

                                newJsonElement.options = Object.assign({}, newJsonElement.options, subJson.$inlineEditor && subJson.$inlineEditor.options)

                                Object.keys(newJsonElement.options).forEach(key => {
                                    let val = propertyByPath('$original_'+key, subJson, '_')
                                    if( !val ){
                                        val = propertyByPath(key, subJson, '_')
                                    }
                                    newJsonElement.options[key].value = val
                                })
                                /* if (options.$inlineEditor_dataResolver) {
                                     if (options.$inlineEditor_dataResolver.value.constructor === String) {

                                     }
                                 }*/

                                if (isCms) {
                                    this.setFormOptionsByProperties(subJson.p, newJsonElement.options, 'p_')
                                }

                                this.setState({addChildDialog: {selected: newJsonElement, edit: true}})
                            }
                        })
                    }
                }

             /*   if( _inlineEditor.picker ){
                    menuItems.push({
                        name: 'Bild Auswählen',
                        icon: <BuildIcon/>,
                        onClick: ()=>{
                            this.openPicker(_inlineEditor.picker)
                        }
                    })
                }*/


                if (_inlineEditor.menu.editTemplate !== false) {
                    menuItems.push({
                        name: 'Template bearbeiten',
                        icon: <BuildIcon/>,
                        onClick: this.handleEditClick.bind(this)
                    })
                }

                if (_inlineEditor.menu.clone !== false) {
                    menuItems.push({
                        name: 'Element duplizieren',
                        icon: <FileCopyIcon/>,
                        onClick: this.handleCopyClick.bind(this)
                    })
                }

                if (!isLoop && _inlineEditor.allowDrop) {
                    menuItems.push({
                        name: 'Element hinzufügen',
                        icon: <AddIcon/>,
                        onClick: () => {
                            JsonDomHelper.disableEvents = true
                            this.setState({addChildDialog: {selected: false}})
                        }
                    })
                }

                if (_inlineEditor.menu.addBelow !== false) {
                    menuItems.push({
                        name: 'Element unterhalb einfügen',
                        icon: <PlaylistAddIcon/>,
                        onClick: () => {
                            JsonDomHelper.disableEvents = true
                            this.setState({addChildDialog: {selected: false, addbelow: true}})
                        }
                    })
                }

                if (_inlineEditor.menu.remove !== false) {
                    menuItems.push({
                        name: 'Element entfernen',
                        icon: <DeleteIcon/>,
                        onClick: () => {
                            this.setState({deleteConfirmDialog: true})
                        }
                    })
                }

                if (_inlineEditor.menu.clipboard !== false) {
                    menuItems.push({
                        divider: true,
                        name: 'Element in Zwischenablage kopieren',
                        icon: <FileCopyIcon/>,
                        onClick: () => {
                            navigator.clipboard.writeText(JSON.stringify(subJson, null, 4))
                        }
                    })

                    menuItems.push({
                        name: 'Element von Zwischenablage unterhalb einfügen',
                        icon: <FileCopyIcon/>,
                        onClick: () => {

                            navigator.clipboard.readText().then(text => {
                                    if( text ){
                                        try {
                                            const json = JSON.parse(text),
                                                pos = parseInt(rest._key.substring(rest._key.lastIndexOf('.') + 1)) + 1

                                            this.handleAddChildClick(json, pos)

                                        }catch (e) {

                                        }
                                    }
                                }).catch(err => {
                                    console.log('Something went wrong', err)
                                })

                        }
                    })
                }
            }
            toolbar = <div
                key={rest._key + '.toolbar'}
                data-toolbar={rest._key}
                onMouseOver={this.onToolbarMouseOver.bind(this)}
                onMouseOut={this.onToolbarMouseOut.bind(this, classes.toolbar)}
                style={{top: this.state.top, left: this.state.left, height: this.state.height}}
                className={classNames(classes.toolbar, toolbarHovered && classes.toolbarHovered)}>
                <div
                    className={classes.info}>{subJson ? subJson.t || 'Text' + ' - ' : ''}{rest.id || rest._key}</div>
                {menuItems.length > 0 && <SimpleMenu
                    anchorReference={this.state.mouseY ? "anchorPosition" : "anchorEl"}
                    anchorPosition={
                        this.state.mouseY && this.state.mouseX
                            ? {top: this.state.mouseY, left: this.state.mouseX}
                            : undefined
                    }
                    open={this.state.mouseY?toolbarMenuOpen:undefined}
                    onOpen={() => {
                        this.setState({toolbarMenuOpen: true})
                    }}
                    onClose={() => {
                        this.setState({
                            hovered: false,
                            toolbarHovered: false,
                            toolbarMenuOpen: false,
                            mouseY: undefined,
                            mouseX: undefined
                        })
                    }}
                    className={classes.toolbarMenu} mini items={menuItems}/>}
            </div>

            if(_inlineEditor.highlight !== false) {
                highlighter = <span
                    key={rest._key + '.highlighter'}
                    data-highlighter={rest._key}
                    style={{
                        top: this.state.top,
                        left: this.state.left,
                        height: this.state.height,
                        width: this.state.width
                    }}
                    className={classNames(classes.highlighter, isCms || _inlineEditor.picker ? classes.bgBlue : classes.bgYellow)}>{_inlineEditor.picker || isCms ?
                    <div
                        onMouseOver={this.onToolbarMouseOver.bind(this)}
                        onMouseOut={this.onToolbarMouseOut.bind(this, classes.picker)}
                        onContextMenu={events.onContextMenu.bind(this)}
                        onClick={(e) => {
                            e.stopPropagation()
                            if (isCms) {
                                window.location = '/' + subJson.p.slug
                            } else {
                                this.openPicker(_inlineEditor.picker)
                            }
                        }}
                        className={classes.picker}>{isCms && subJson.p ? subJson.p.id || subJson.p.slug :
                        <ImageIcon/>}</div> : ''}</span>
            }
        }

        if (_inlineEditor.picker) {
            /*events.onClick = () => {

            }*/
            //events.className = classNames(rest.className, classes.picker)
        }


        let kids
        if (isTempalteEdit && _inlineEditor.allowDrop) {
            kids = []
            if (children && children.length) {
                for (let i = 0; i < children.length; i++) {
                    kids.push(this.getDropArea(this.props, i))
                    kids.push(children[i])
                }
                kids.push(this.getDropArea(this.props, children.length))
            } else {
                kids.push(this.getDropArea(this.props, 0))
            }

        } else {
            kids = children
        }
        if (_inlineEditor.toolbar) {
            const rootToolbar = <div key="rootToolbar" className={classNames(classes.rootToolbar)}>toolbar</div>
            kids.push(rootToolbar)
        }
        let comp

        if (isCms) {
            comp = <div _key={rest._key} key={rest._key} {...events}>
                <_WrappedComponent onChange={newOnChange || onChange} {...rest} children={kids}/>
            </div>
        } else {
            comp = <_WrappedComponent onChange={newOnChange || onChange} _inlineeditor="true" data-isempty={rest.dangerouslySetInnerHTML?false:children?false:true}
                                      key={rest._key} {...events} {...rest} children={kids}/>
        }
        if (toolbar) {
            return [comp, <AddToBody key="hover">{highlighter}{toolbar}</AddToBody>]
        } else {
            const jsonElements = getJsonDomElements()
            return <React.Fragment>{comp}
                {(deleteConfirmDialog &&
                    <AddToBody>
                        <SimpleDialog fullWidth={true} maxWidth="sm" key="deleteConformation" open={true}
                                      onClose={(e) => {
                                          if (e.key === 'delete') {
                                              this.handleDeleteClick()
                                          }
                                          this.setState({deleteConfirmDialog: null})
                                      }}
                                      actions={[
                                          {
                                              key: 'cancel',
                                              label: 'Abbrechen',
                                              type: 'secondary'
                                          },
                                          {
                                              key: 'delete',
                                              label: 'Löschen',
                                              type: 'primary'
                                          }]}
                                      title="Löschung bestätigen">
                            Sind Sie ganz sicher, dass Sie das Element löschen möchten?
                        </SimpleDialog>
                    </AddToBody>
                )}
                {(deleteSourceConfirmDialog &&
                    <AddToBody>
                        <SimpleDialog fullWidth={true} maxWidth="sm" key="deleteSourceConformation" open={true}
                                      onClose={(e) => {
                                          if (e.key === 'delete') {
                                              const {type,_id} = deleteSourceConfirmDialog
                                              this.props.client.mutate({
                                                  mutation: gql`mutation delete${type}($_id: ID!) {delete${type}(_id: $_id) {_id status}}`,
                                                  variables:{_id},
                                                    update: (store, {data: {setKeyValue}}) => {
                                                        window.location.href = window.location.href
                                                    }
                                                  }
                                              )

                                          }
                                          this.setState({deleteSourceConfirmDialog: null})
                                      }}
                                      actions={[
                                          {
                                              key: 'cancel',
                                              label: 'Abbrechen',
                                              type: 'secondary'
                                          },
                                          {
                                              key: 'delete',
                                              label: 'Löschen',
                                              type: 'primary'
                                          }]}
                                      title="Löschung bestätigen">
                            Sind Sie ganz sicher, dass Sie das Element löschen möchten?
                        </SimpleDialog>
                    </AddToBody>
                )}
                {(addChildDialog &&
                    <AddToBody><SimpleDialog fullWidth={true} maxWidth="md" key="addChildDialog" open={true}
                                             onClose={(e) => {
                                                 const selected = addChildDialog.selected
                                                 if (e.key === 'save' && selected) {

                                                     const comp = {'t': selected.tagName, ...selected.defaults}

                                                     let pos

                                                     if (addChildDialog.form) {
                                                         const fields = addChildDialog.form.state.fields
                                                         Object.keys(fields).forEach(key => {
                                                             let val = fields[key]
                                                             if( selected.options && selected.options[key] && selected.options[key].template){
                                                                 setPropertyByPath(val, '$original_'+key, comp, '_')
                                                                 val = Util.replacePlaceholders(selected.options[key].template, val[0])
                                                             }
                                                             setPropertyByPath(val, key, comp, '_')
                                                         })
                                                     }
                                                     if (addChildDialog.addbelow) {
                                                         // determine position to insert in parent node
                                                         pos = parseInt(rest._key.substring(rest._key.lastIndexOf('.') + 1)) + 1
                                                     }

                                                     if (addChildDialog.edit) {

                                                         const mySubJson = getComponentByKey(rest._key, _json)

                                                         Object.keys(comp).forEach((key) => {
                                                             if (!subJson[key]) {
                                                                 subJson[key] = comp[key]
                                                             } else if (subJson[key].constructor === Object) {
                                                                 subJson[key] = {...subJson[key], ...comp[key]}
                                                             } else if (subJson[key].constructor === Array) {
                                                                 subJson[key].forEach((item,i)=>{
                                                                     if(comp[key] && comp[key][i]){
                                                                         subJson[key][i] = {...item, ...comp[key][i]}
                                                                     }
                                                                 })
                                                             } else {
                                                                 subJson[key] = comp[key]
                                                             }
                                                         })

                                                         if(subJson.$inlineEditor && subJson.$inlineEditor.options){
                                                             Object.keys(subJson.$inlineEditor.options).forEach(optKey=>{
                                                                 delete subJson.$inlineEditor.options[optKey].value
                                                             })
                                                         }

                                                         _onChange(_json, true)

                                                     } else {
                                                         // add new
                                                         this.handleAddChildClick(comp, pos)
                                                     }
                                                 }
                                                 JsonDomHelper.disableEvents = false
                                                 this.setState({addChildDialog: null})
                                             }}
                                             actions={[
                                                 {
                                                     key: 'cancel',
                                                     label: 'Abbrechen',
                                                     type: 'secondary'
                                                 },
                                                 {
                                                     key: 'save',
                                                     label: 'Speichern',
                                                     type: 'primary'
                                                 }]}
                                             title="Bearbeitung">

                        {!addChildDialog.edit && <SimpleSelect
                            fullWidth={true}
                            label="Element auswählen"
                            value={addChildDialog.selected && addChildDialog.selected.defaults && addChildDialog.selected.defaults.$inlineEditor.elementKey}
                            onChange={(e) => {
                                const value = e.target.value
                                let item
                                for (let i = 0; i < jsonElements.length; i++) {
                                    const comp = jsonElements[i]
                                    if (value === comp.defaults.$inlineEditor.elementKey) {
                                        // replace __uid__ placeholder
                                        const uid = 'genid_' + Math.random().toString(36).substr(2, 9)
                                        item = JSON.parse(JSON.stringify(comp).replace(/__uid__/g, uid))
                                        break
                                    }
                                }
                                console.log(item)
                                this.setState({addChildDialog: {...addChildDialog, selected: item, form: null}})
                            }}
                            items={jsonElements}
                        />}

                        {addChildDialog.selected && addChildDialog.selected.options &&
                        <GenericForm primaryButton={false} ref={(e) => {
                            addChildDialog.form = e
                        }} fields={addChildDialog.selected.options}/>}

                    </SimpleDialog></AddToBody>)}</React.Fragment>
        }
    }
}


JsonDomHelper.propTypes = {
    client: PropTypes.instanceOf(ApolloClient).isRequired,
    classes: PropTypes.object.isRequired,
    _WrappedComponent: PropTypes.any.isRequired,
    _cmsActions: PropTypes.object.isRequired,
    _key: PropTypes.string.isRequired,
    _scope: PropTypes.object.isRequired,
    _json: PropTypes.any,
    _onChange: PropTypes.func,
    _onDataResolverPropertyChange: PropTypes.func
}


/**
 * Map the state to props.
 */
const mapStateToProps = () => {
    return {}
}


/**
 * Map the actions to props.
 */
const mapDispatchToProps = (dispatch) => ({
    _cmsActions: bindActionCreators(CmsActions, dispatch)
})


/**
 * Connect the component to
 * the Redux store.
 */
export default withApollo(connect(
    mapStateToProps,
    mapDispatchToProps
)(withStyles(styles)(JsonDomHelper)))
