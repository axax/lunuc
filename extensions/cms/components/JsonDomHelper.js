import React from 'react'
import ReactDOM from 'react-dom'
import {
    SimpleDialog,
    SimpleMenu,
    SettingsInputComponentIcon,
    EditIcon,
    LaunchIcon,
    DeleteIcon,
    AddIcon,
    BuildIcon,
    ImageIcon,
    FileCopyIcon,
    PlaylistAddIcon,
    FlipToBackIcon,
    MoveDownIcon,
    MoveUpIcon,
    LowPriorityIcon,
    TransformIcon
} from 'ui/admin'
import JsonDomAddElementDialog from './jsondomhelper/JsonDomAddElementDialog'
import AddToBody from './AddToBody'
import Util from 'client/util/index.mjs'
import {propertyByPath, setPropertyByPath} from '../../../client/util/json.mjs'
import {
    getComponentByKey,
    addComponent,
    removeComponent,
    isTargetAbove,
    copyComponent, recalculatePixelValue
} from '../util/jsonDomUtil'
import {DROPAREA_ACTIVE, DROPAREA_OVERLAP, DROPAREA_OVER, ALLOW_DROP, JsonDomDraggable, onJsonDomDrag, onJsonDomDragEnd} from '../util/jsonDomDragUtil'
import config from 'gen/config-client'
import {getJsonDomElements, MEDIA_PROJECTION, replaceUidPlaceholder} from '../util/elements'
import {deepMergeOptional, deepMerge} from '../../../util/deepMerge.mjs'
import {CAPABILITY_MANAGE_CMS_TEMPLATE} from '../constants/index.mjs'
import {client} from '../../../client/middleware/graphql'
import {openWindow} from '../../../client/util/window'
import {convertRawValuesFromPicker} from '../../../client/util/picker'
import {showTooltip} from '../../../client/util/tooltip'
import styled from '@emotion/styled'
import {CAPABILITY_ADMIN_OPTIONS} from '../../../util/capabilities.mjs'
import {_t} from '../../../util/i18n.mjs'

const {DEFAULT_LANGUAGE} = config
const CONVERTABLE_ELEMENTS = ['image','layout-1-2','layout-1-3','layout-1-4','layout-1-6','headline','p','richText']


const StyledHighlighter = styled('span')(({ color, selected }) => ({
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
    alignItems: 'center',
    ...(selected && {
        border: '2px solid #8b3dff',
    }),
    ...(color==='yellow' && {
        background: 'rgba(245, 245, 66,0.05)',
        boxShadow: '0px 0px 6px 2px rgba(0,0,0,0.4), 0px 0px 5px 0px rgba(235,252,0,1)'
    }),
    ...(color==='red' && {
        background: 'rgba(245, 66, 66,0.1)',
        boxShadow: '0px 0px 6px 2px rgba(0,0,0,0.2), 0px 0px 5px 0px rgba(245, 66, 66,1)'
    }),
    ...(color==='blue' && {
        boxShadow: '0px 0px 6px 2px rgba(0,0,0,0.4), 0px 0px 5px 0px rgba(84, 66, 245,1)',
        background: 'rgba(84, 66, 245,0.1)',
        color: 'black',
        fontWeight: 'bold',
        fontSize: '0.9rem',
        textShadow: '1px 1px 2px white'
    }),
}))

const StyledDropArea = styled('span')({
    transition: 'visibility .5s ease-out, opacity .5s ease-out',
    opacity: 0,
    zIndex: 999,
    display: 'flex',
    justifyContent:'center',
    alignItems:'center',
    visibility: 'hidden',
    position: 'absolute',
    fontWeight: 'normal',
    borderRadius: '5px',
    background: '#000000',
    padding: '5px',
    maxWidth: '100%',
    margin: '-28px 0 0 0 !important',
    border: '1px dashed #c1c1c1',
    height: '32px',
    color: '#fff',
    textAlign: 'center',
    fontSize: '0.9rem',
    '> span':{
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    /*'&:after': {
        top: '100%',
        left: '50%',
        border: 'solid transparent',
        content: '""',
        height: 0,
        width: 0,
        position: 'absolute',
        pointerEvents: 'none',
        borderColor: 'rgba(0, 0, 0, 0)',
        borderTopColor: '#000',
        borderWidth: '10px',
        marginLeft: '-10px'
    },*/
    [`&.${DROPAREA_ACTIVE}`]:{
        visibility: 'visible',
        opacity: 0.8
    },
    [`&.${DROPAREA_OVERLAP}`]:{
        position: 'relative',
        marginTop: '0px !important'
    },
    [`&.${DROPAREA_OVER}`]:{
        zIndex: 1000,
        opacity: '1 !important',
        visibility: 'visible !important',
        background: 'red',
        '&:after': {
            borderTopColor: 'red'
        }
    },
    [`*`]:{
        pointerEvents: 'none'
    }
})


const StyledPicker = styled('div')({
    cursor: 'pointer',
    pointerEvents: 'auto'
})

const StyledToolbarButton = styled('div')({
    zIndex: 1000,
    position: 'fixed',
    maxHeight: '200px'
})

const StyledToolbarMenu = styled(SimpleMenu)({
    position: 'absolute',
    left: '-2.2rem',
    top: 'calc(50% - 1.5rem)'
})

const StyledInfoBox = styled('div')({
    position: 'absolute',
    top:'-16px',
    color:'#ffffff',
    background: '#000000',
    padding: '2px 3px',
    fontSize:'11px',
    lineHeight:1,
    zIndex: 1001,
    whiteSpace:'nowrap'
})

const StyledHorizontalDivider = styled('div')({
    position: 'absolute',
    height: '4px',
    width:'100%',
    pointerEvents: 'auto',
    fontSize:'0.8rem',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    color:'rgb(100,100,100)',
    background: 'rgba(66, 164, 245,0.09)',
    /*borderBottom:'solid 2px #000000',*/
    right: 0,
    top: '100%',
    left: 0,
    cursor: 'ns-resize',
    zIndex: 1002,
})

const deleteDialogActions = [
    {
        key: 'cancel',
        label: _t('core.cancel'),
        type: 'secondary'
    },
    {
        key: 'delete',
        label: _t('core.delete'),
        type: 'primary'
    }]

const getHighlightPosition = (node)=>  {
    let childMaxTop = 0,
        childMaxLeft = 0,
        childMinTop = Infinity,
        childMinLeft = Infinity,
        allAbs = node.childNodes.length>0

    if(node.tagName==='SELECT') {
        allAbs=false
    }else{
        for (const childNode of node.childNodes) {

            if (childNode.nodeType === Node.ELEMENT_NODE) {
                const style = window.getComputedStyle(childNode)
                if (style.display !== 'none' && style.opacity > 0) {
                    const rect = childNode.getBoundingClientRect()
                    childMinLeft = Math.min(rect.left, childMinLeft)
                    childMaxLeft = Math.max(rect.left + (rect.width ?? 0), childMaxLeft)
                    childMinTop = Math.min(rect.top, childMinTop)
                    childMaxTop = Math.max(rect.top + (rect.height ?? 0), childMaxTop)
                } else {
                    allAbs = false
                }
                if (style.position !== 'absolute') {
                    allAbs = false
                }
            } else {
                allAbs = false
            }
        }
    }

    if(!allAbs) {
        const rect = node.getBoundingClientRect()
        childMinLeft = Math.min(rect.left, childMinLeft)
        childMaxLeft = Math.max(rect.left + (rect.width ?? 0), childMaxLeft)
        childMinTop = Math.min(rect.top, childMinTop)
        childMaxTop = Math.max(rect.top + (rect.height ?? 0), childMaxTop)
    }

    const computedStyle = window.getComputedStyle(node)
    return {
        hovered: true,
        height: childMaxTop - childMinTop,
        width: childMaxLeft - childMinLeft,
        top: childMinTop,
        left: childMinLeft,
        marginBottom: computedStyle.marginBottom
    }
}


let aftershockTimeout
const highlighterHandler = (e, observer, after) => {
    const hightlighters = document.querySelectorAll('[data-highlighter]')
    if (hightlighters && hightlighters.length > 0) {
        hightlighters.forEach(hightlighter => {
            const key = hightlighter.getAttribute('data-highlighter')
            const node = document.querySelector('[_key="' + key + '"]')

            if (node) {
                const pos = getHighlightPosition(node)
                hightlighter.style.top = pos.top + 'px'
                hightlighter.style.left = pos.left + 'px'
                hightlighter.style.width = pos.width + 'px'
                hightlighter.style.height = pos.height + 'px'

                const toolbar = document.querySelector('[data-toolbar="' + key + '"]')
                if (toolbar) {
                    toolbar.style.top = pos.top + 'px'
                    toolbar.style.left = pos.left + 'px'
                    toolbar.style.height = pos.height + 'px'
                }

            }
        })
    }
    if (!after) {
        clearTimeout(aftershockTimeout)
        aftershockTimeout = setTimeout(() => {
            highlighterHandler(e, observer, true)
            for (let i = 0; i < 25; i++) {
                setTimeout(() => {
                    highlighterHandler(e, observer, true)
                }, i * 20)
            }
        }, 50)
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Alt') {
        JsonDomHelper.altKeyDown = true
        JsonDomHelper.disabledSelect = []
        document.querySelectorAll('select').forEach(el => {
            if (!el.disabled) {
                el.disabled = true
                JsonDomHelper.disabledSelect.push(el)
            }
        })
    }
})
const altKeyReleased = () => {
    JsonDomHelper.altKeyDown = false
    if(JsonDomHelper.disabledSelect) {
        JsonDomHelper.disabledSelect.forEach(el => {
            el.disabled = false
        })
    }
}
document.addEventListener('keyup', (e) => {
    if (e.key === 'Alt') {
        altKeyReleased()
    }
})

document.addEventListener('scroll', highlighterHandler)



class JsonDomHelper extends React.Component {
    static disableEvents = false
    static altKeyDown = false
    static mutationObserver = false
    static selected = []

    state = {
        hovered: false,
        top: 0,
        left: 0,
        height: 0,
        width: 0,
        marginBottom:0,
        toolbarHovered: false,
        dragging: false,
        toolbarMenuOpen: false,
        addChildDialog: null,
        deleteConfirmDialog: false,
        deleteSelectionConfirmDialog: false
    }

    constructor(props) {
        super(props)
    }

    componentDidMount() {
        if (!JsonDomHelper.mutationObserver) {
            JsonDomHelper.mutationObserver = new MutationObserver(highlighterHandler)
        }
        const layout = document.querySelector('[data-layout-content]')

        if (layout) {
            JsonDomHelper.mutationObserver.observe(layout, {
                attributes: false,
                childList: true,
                characterData: true,
                subtree: true
            })
        }

    }

    shouldComponentUpdate(props, state) {
        if (JsonDomDraggable.element && JsonDomDraggable.element != this) {
            return false
        }
        return props.dangerouslySetInnerHTML !== this.props.dangerouslySetInnerHTML ||
            props._json !== this.props._json ||
            props.children !== this.props.children ||
            state.hovered !== this.state.hovered ||
            state.addChildDialog !== this.state.addChildDialog ||
            state.deleteConfirmDialog !== this.state.deleteConfirmDialog ||
            state.deleteSelectionConfirmDialog !== this.state.deleteSelectionConfirmDialog ||
            state.deleteSourceConfirmDialog !== this.state.deleteSourceConfirmDialog ||
            state.dragging !== this.state.dragging ||
            state.top !== this.state.top ||
            state.left !== this.state.left ||
            state.height !== this.state.height ||
            state.width !== this.state.width ||
            state.marginBottomNew !== this.state.marginBottomNew ||
            state.toolbarHovered !== this.state.toolbarHovered ||
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

        if (!hovered && node) {
            const stat = getHighlightPosition(node)
            this.helperTimeoutIn = setTimeout(() => {
                this.setState(stat,()=>{
                    highlighterHandler(node)
                })
            }, 80)
        }

    }

    onHelperMouseOut(e) {
        const {hovered, dragging} = this.state

        if (hovered || dragging) {
            e.stopPropagation()
        }
        if (JsonDomHelper.altKeyDown) {
            setTimeout(() => {
                this.onHelperMouseOut(e)
            }, 80)
            return
        }

        if (dragging) {
            return
        }

        if (hovered) {
            this.helperTimeoutOut = setTimeout(() => {
                if(!this.state.dividerHovered) {
                    this.setState({hovered: false})
                }
            }, 80)
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

    onToolbarMouseOut(e) {
        e.stopPropagation()
        if (!this.state.toolbarMenuOpen) {
            let el = e.toElement || e.relatedTarget
            while (el && el.parentNode && el.parentNode !== window) {
                if (el.dataset.toolbar || el.dataset.picker) {
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
        if (JsonDomHelper.disableEvents) {
            return
        }
        if (!JsonDomDraggable.element) {
            JsonDomDraggable.element = this
            JsonDomDraggable.props = this.props
            this.setState({toolbarHovered: false, hovered: false, dragging: true})
        }
    }

    onDragEnd(e) {
        e.stopPropagation()
        this.resetDragState()
    }

    onDragEnterDropArea(e) {
        e.stopPropagation()
        e.preventDefault()
        e.currentTarget.classList.add(DROPAREA_OVER)
    }

    onDragOverDropArea(e) {
        e.stopPropagation()
        e.preventDefault()
    }

    onDragLeaveDropArea(e) {
        e.stopPropagation()
        e.currentTarget.classList.remove(DROPAREA_OVER)
    }

    onDrop(e) {
        e.stopPropagation()
        e.preventDefault()
        JsonDomHelper.disableEvents = true

        const {_json, _onTemplateChange} = this.props
        e.currentTarget.classList.remove(DROPAREA_OVER)

        if (JsonDomDraggable.props) {
            let sourceKey = JsonDomDraggable.props._key,
                targetKey = e.currentTarget.getAttribute('data-key'),
                targetIndex = parseInt(e.currentTarget.getAttribute('data-index'))

            if (targetKey) {
                // 1. get element from json structure by key
                const source = getComponentByKey(sourceKey, _json)
                if (source) {
                    this.moveElementFromTo(sourceKey, targetKey, targetIndex, _json, source)
                } else{
                    this.setState({addChildDialog: {
                            payload: {dropIndex: targetIndex},
                            currentElement: JsonDomDraggable.props.element
                    }})
                }

            }
        }
        this.enableEvents()
        this.resetDragState()
    }

    enableEvents(){
        setTimeout(() => {
            JsonDomHelper.disableEvents = false
        }, 200)
    }

    moveElementFromTo(sourceKey, targetKey, targetIndex, _json, source) {
        const {_onTemplateChange} = this.props

        if (isTargetAbove(sourceKey, targetKey + '.' + targetIndex)) {
            //2. remove it from json
            if (removeComponent(sourceKey, _json)) {

                // 3. add it to new position
                addComponent({key: targetKey, json: _json, index: targetIndex, component: source})
                _onTemplateChange(_json, true)

            }
        } else {
            addComponent({key: targetKey, json: _json, index: targetIndex, component: source})
            removeComponent(sourceKey, _json)
            _onTemplateChange(_json, true)
        }
    }

    resetDragState() {
        onJsonDomDragEnd()
        if (JsonDomHelper.altKeyDown) {
            altKeyReleased()
        }
        this.setState({toolbarHovered: false, hovered: false, dragging: false})
    }


    handleTemplateEditClick(e) {
        e.stopPropagation()
        e.preventDefault()
        const {_cmsActions, _key, _json, _scope} = this.props
        _cmsActions.editTemplate(_key, _json, _scope)
        this.setState({toolbarHovered: false, hovered: false, dragging: false})

    }

    handleCopyClick(e) {
        e.stopPropagation()
        e.preventDefault()
        const {_onTemplateChange, _key, _json} = this.props

        if(copyComponent(_key, _json)){
            _onTemplateChange(_json, true)
            this.setState({toolbarHovered: false, hovered: false, dragging: false})
        }
    }


    handleDataSource(e, options) {
        e.stopPropagation()
        e.preventDefault()

        const {_cmsActions, _options} = this.props

        const dataSource = this.parseDataSource(_options.source)
        dataSource.options = options
        dataSource._jsonDom = this.props._this

        _cmsActions.editCmsData(dataSource)

    }

    parseDataSource(source) {
        let parsedSource
        if(source) {
            if (source.constructor === String) {

                // source expression: Type:_id
                // or = :tr.de.key
                const pos = source.indexOf(':'), pos2 = source.indexOf(':', pos + 1)

                if (pos > -1) {

                    parsedSource = {
                        type: source.substring(0, pos),
                        _id: source.substring(pos + 1, pos2 > -1 ? pos2 : source.length)
                    }

                    if (pos2 > -1) {
                        parsedSource.props = source.substring(pos2 + 1)
                    }

                }
            } else {
                parsedSource = source
            }

            if (parsedSource && parsedSource.$_id) {
                // resolve _id
                parsedSource._id = propertyByPath(parsedSource.$_id, this.props)

            }
        }

        return parsedSource
    }

    handleAddChildClick(component, {index, dropIndex, newKeys}) {
        if(Array.isArray(component)){
            for(let i = component.length-1; i>=0; i--){
                this.handleAddChildClick(component[i], {index, dropIndex, newKeys})
            }
            return
        }
        const {_key, _json, _onTemplateChange, _onDataResolverPropertyChange} = this.props

        let newkey = _key
        if (index !== undefined) {
            newkey = newkey.substring(0, newkey.lastIndexOf('.'))
        } else {
            index = 0
        }
        if(dropIndex){
            index = dropIndex
        }
        if (component.$inlineEditor && component.$inlineEditor.dataResolver) {
            let dataResolver = component.$inlineEditor.dataResolver

            if (dataResolver.constructor === String) {
                dataResolver = JSON.parse(dataResolver)
            }

            // replace with key only
            component.$inlineEditor.dataResolver = dataResolver.key


            _onDataResolverPropertyChange({value: dataResolver, key: dataResolver.key, instantSave: true})

        }
        addComponent({key: newkey, json: _json, index, component, newKeys})
        _onTemplateChange(_json, true)
    }


    handleDeleteClick(e) {
        const {_key, _json, _onTemplateChange} = this.props
        this.removeByKey(_key)
        _onTemplateChange(_json, true)
    }

    removeByKey(key) {
        const {_json, _onDataResolverPropertyChange} = this.props

        const source = getComponentByKey(key, _json)

        if (source && source.$inlineEditor && source.$inlineEditor.dataResolver) {
            _onDataResolverPropertyChange({value: null, key: source.$inlineEditor.dataResolver})
        }
        removeComponent(key, _json)
    }

    getDropArea(rest, index, fill) {
        let label = ''
        if(Util.hasCapability(_app_.user, CAPABILITY_ADMIN_OPTIONS)) {
            if (rest['data-element-key']) {
                label += rest['data-element-key']
            }
            if (rest['id']) {
                label += '#' + rest['id']
            } else if (rest['className']) {
                label += '.' + rest['className']
            }
        }

        return <StyledDropArea
            onMouseOver={(e) => {
                e.stopPropagation()
            }}
            onDragEnter={this.onDragEnterDropArea.bind(this)}
            onDragOver={this.onDragOverDropArea.bind(this)}
            onDragLeave={this.onDragLeaveDropArea.bind(this)}
            onDrop={this.onDrop.bind(this)}
            data-key={rest._key}
            data-index={index}
            data-drop-area
            data-tag-name={rest._tagName}
            data-fill={fill || ''}
            key={`${rest._key}.dropArea.${index}`}><span>Hier plazieren <small>{label?'('+label+')':''}</small></span></StyledDropArea>
    }

    openPicker(options) {
        const picker = options.picker
        const {_onTemplateChange, _key, _json} = this.props

        const newwindow = openWindow({url:`${_app_.lang !== DEFAULT_LANGUAGE ? '/' + _app_.lang : ''}/admin/typesblank/?opener=true&fixType=${picker.type}${picker.type==='Media'?'&includeFields=info':''}&baseFilter=${encodeURIComponent(picker.baseFilter || '')}`})


        setTimeout(() => {
            newwindow.addEventListener('beforeunload', (e) => {
                if (newwindow.resultValue) {
                    const source = getComponentByKey(_key, _json)
                    if (source) {
                        if (picker.template) {
                            source.$c = Util.replacePlaceholders(picker.template.replace(/\\\{/g, '{'), newwindow.resultValue)
                        } else {
                            if (!source.p) {
                                source.p = {}
                            }
                            const items = convertRawValuesFromPicker({type: picker.type, fieldsToProject: picker.type==='Media'?MEDIA_PROJECTION:[], rawValue: newwindow.resultValue, multi: picker.multi})
                            source.p.src = items
                        }
                        setTimeout(() => {
                            _onTemplateChange(_json)
                        }, 0)
                    }
                }
                delete e['returnValue']
            })
        }, 500)
    }

    setFormOptionsByProperties(json, options, prefix) {

        Object.keys(json).forEach(key => {
            const newKey = prefix + key, value = propertyByPath(key, json, '_')

            if (!options[newKey]) {
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
        const {_WrappedComponent, _json, _cmsActions, _onTemplateChange, _onDataResolverPropertyChange, children, _tagName, _options, _inlineEditor, _dynamic, onChange, onClick, ...rest} = this.props
        const {hovered, toolbarHovered, toolbarMenuOpen, addChildDialog, deleteConfirmDialog, deleteSelectionConfirmDialog, deleteSourceConfirmDialog} = this.state

        if(!rest._key){
            return
        }
        const menuItems = [],
            isCms = _tagName === 'Cms',
            isInLoop = rest._key.indexOf('$loop') >= 0 && !Util.hasCapability(_app_.user, CAPABILITY_MANAGE_CMS_TEMPLATE),
            isElementActive = !JsonDomHelper.disableEvents && (hovered || toolbarHovered || toolbarMenuOpen),
            isSelected = JsonDomHelper.selected.indexOf(this)>=0


        let hasJsonToEdit = !!_json, subJson, toolbar, highlighter,
            overrideEvents = {}, parsedSource

        const events = {
            onContextMenu: (e) => {
                e.preventDefault()
                if (menuItems.length > 0 || isCms) {
                    e.stopPropagation()
                    this.setState({
                        toolbarMenuOpen: true,
                        toolbarHovered: true,
                        mouseX: e.clientX - 2,
                        mouseY: e.clientY - 4
                    })
                }
            },
            onClick: (e) =>{
                if(e.shiftKey){
                    e.stopPropagation()
                    e.preventDefault()
                    if(isSelected){
                        JsonDomHelper.selected.splice(JsonDomHelper.selected.indexOf(this), 1)
                    }else {
                        JsonDomHelper.selected.push(this)
                    }
                    this.forceUpdate()
                    return false
                }else{
                    this.deselectSelected()
                    if(overrideEvents.onClick){
                        overrideEvents.onClick(e)
                    }
                }
            }
        }

        if (_options.highlight !== false) {
            events.onMouseOver = this.onHelperMouseOver.bind(this)
            events.onMouseOut = this.onHelperMouseOut.bind(this)
        }
        if (_options.allowDrop === undefined) {
            _options.allowDrop = ALLOW_DROP.indexOf(_tagName) >= 0 && !this.props.dangerouslySetInnerHTML
        }
        if (!_options.menu) {
            _options.menu = {}
        }
        if (!_options.menuTitle) {
            _options.menuTitle = {}
        }

        if (hasJsonToEdit) {
            subJson = getComponentByKey(rest._key, _json)

            if (!subJson) {
                hasJsonToEdit = false
            }

            if (isElementActive || _options.mode === 'source') {
                // in source mode source is even editable when element is not active
                parsedSource = this.parseDataSource(_options.source)
            }

        }

        if(!parsedSource && _dynamic){
            return <_WrappedComponent
                onClick={onClick}
                onChange={onChange}
                {...rest}>{children}</_WrappedComponent>
        }
        const isDraggable = !isInLoop && hasJsonToEdit && _options.allowDrag !== false
        if (isDraggable) {
            events.draggable = 'true'
            events.onDragEnd = this.onDragEnd.bind(this)
            events.onDrag = onJsonDomDrag.bind(this)
            events.onDrop = this.onDrop.bind(this)
            events.onMouseDown = (e) => {
                if (e.target.tagName === 'SELECT') {
                    const rect = e.target.getBoundingClientRect()
                    showTooltip('Formelement mit gedrückter alt Taste verschieben', {
                        top: rect.top - 60,
                        left: rect.left,
                        closeIn: 2500
                    })
                }
            }
        }

        events.onDragStart = e => {
            if (isDraggable) {
                this.onDragStart(e)
            } else {
                e.stopPropagation()
            }
        }


        if (parsedSource && parsedSource.newOnClick) {
            overrideEvents.onClick = (e) => {
                this.handleDataSource(e, {create: true})
            }
        }


        if (isElementActive || isSelected) {

            if(isElementActive) {
                this.createContextMenu({
                    isCms, subJson, menuItems, hasJsonToEdit, parsedSource, _onDataResolverPropertyChange,
                    overrideEvents, onChange, _options, _dynamic, rest, _json, isInLoop, isSelected
                })

                const elementKey = rest['data-element-key'] || _tagName
                toolbar = <StyledToolbarButton
                    key={rest._key + '.toolbar'}
                    data-toolbar={rest._key}
                    onMouseOver={this.onToolbarMouseOver.bind(this)}
                    onMouseOut={this.onToolbarMouseOut.bind(this)}
                    style={{top: this.state.top, left: this.state.left, height: this.state.height}}>

                    <StyledInfoBox>{(_t(`elements.key.${elementKey}`,null,elementKey)) + (rest.id?` (${rest.id})`:(rest.slug?` (${rest.slug})`:''))}</StyledInfoBox>


                    {menuItems.length > 0 && <StyledToolbarMenu
                        anchorReference={this.state.mouseY ? "anchorPosition" : "anchorEl"}
                        anchorPosition={
                            this.state.mouseY && this.state.mouseX
                                ? {top: this.state.mouseY, left: this.state.mouseX}
                                : undefined
                        }
                        open={this.state.mouseY ? toolbarMenuOpen : undefined}
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
                        avatarIcon={true}
                        mini items={menuItems}/>}
                </StyledToolbarButton>
            }
            if (isSelected || _options.highlight !== false) {
                const highligherColor = _dynamic ? 'red' : isCms || _options.picker ? 'blue' : 'yellow'
                let marginBottomStyle = subJson?.p?.style?.marginBottom?.trim()

                highlighter = <StyledHighlighter
                    key={rest._key + '.highlighter'}
                    data-highlighter={rest._key}
                    style={{
                        top: this.state.top - 1,
                        left: this.state.left - 1,
                        height: this.state.height + 2,
                        width: this.state.width + 2
                    }}
                    selected={isSelected}
                    color={highligherColor}>{_options.picker || isCms ?
                    <StyledPicker
                        data-picker={rest._key}
                        onMouseOver={this.onToolbarMouseOver.bind(this)}
                        onMouseOut={this.onToolbarMouseOut.bind(this)}
                        onContextMenu={events.onContextMenu.bind(this)}
                        onClick={(e) => {
                            e.stopPropagation()
                            if(_options.openOnClick===false){
                                return
                            }
                            if (isCms) {
                                if(subJson.p.component && subJson.p.component.length > 0){
                                    this.props.history.push('/' + subJson.p.component[0].slug)
                                }else {
                                    this.props.history.push('/' + subJson.p.slug)
                                }
                            } else {
                                this.openPicker(_options)
                            }
                        }}>{isCms && subJson && subJson.p ? subJson.p.id || subJson.p.slug :
                        <ImageIcon/>}</StyledPicker> : ''}
                    <StyledHorizontalDivider style={{height:this.state.marginBottomNew || this.state.marginBottom}}
                                             onMouseDown={(e)=>{
                                                 this.setState({dividerMousePos:e.pageY})
                                             }}
                                             onMouseUp={()=>{
                                                 if(this.state.marginBottomNew) {
                                                     const finalValue = recalculatePixelValue(marginBottomStyle, this.state.marginBottomNew, this.state.marginBottom)
                                                     setPropertyByPath(finalValue,'p.style.marginBottom',subJson)
                                                     _onTemplateChange(_json, true)

                                                 }
                                                this.setState({dividerMousePos:false,
                                                    marginBottom: this.state.marginBottomNew,
                                                    marginBottomNew:false})
                                             }}
                                             onMouseMove={(e)=>{
                                                 if(this.state.dividerMousePos) {
                                                     const marginBottom = parseFloat(this.state.marginBottom)
                                                     let newMarginBottom = marginBottom + (e.pageY - this.state.dividerMousePos)
                                                     if(isNaN(newMarginBottom) || newMarginBottom< 10) {
                                                         newMarginBottom = 10
                                                     }
                                                     this.setState({marginBottomNew: newMarginBottom + 'px'})
                                                 }
                                             }}
                                             onMouseOver={()=>{
                                                 this.setState({dividerHovered:true})
                                             }}
                                             onMouseOut={(e)=>{
                                                 this.setState({dividerHovered: false,dividerMousePos:false, marginBottomNew:false})
                                                 this.onHelperMouseOut(e)
                                             }}>{this.state.marginBottom!='0px'?(Math.round(parseFloat(this.state.marginBottomNew || this.state.marginBottom) * 100) / 100 + 'px')+(marginBottomStyle && this.state.marginBottom!=marginBottomStyle?` = ${marginBottomStyle}`:''):''}</StyledHorizontalDivider></StyledHighlighter>
            }
        }

        let kids = this.addDropAreasToChildren({children, hasJsonToEdit, isInLoop, _options})

        let comp
        if (isCms) {
            comp = <div _key={rest._key} key={rest._key} {...events}>
                <_WrappedComponent
                    onChange={overrideEvents.onChange || onChange}
                    onClick={overrideEvents.onClick || onClick}
                    {...rest}
                    children={kids}/>
            </div>
        } else {
            let isEmpty = false
            if (!children && !rest.dangerouslySetInnerHTML) {
                isEmpty = true
            } else if (children && children.constructor === Array && children.length === 0) {
                isEmpty = true
            }
            comp = <_WrappedComponent
                onDoubleClick={overrideEvents.onDoubleClick}
                onChange={overrideEvents.onChange || onChange}
                onClick={overrideEvents.onClick || onClick}
                _inlineeditor={_inlineEditor ? _inlineEditor.toString() : ''}
                data-isempty={isEmpty}
                key={rest._key}
                {...events}
                {...rest}
                children={kids}/>
        }
        if (toolbar || isSelected) {
            return [comp, <AddToBody key="hover">{highlighter}{toolbar}</AddToBody>,(deleteSelectionConfirmDialog &&
                <SimpleDialog fullWidth={true} maxWidth="sm" key="deleteSelectionConfirm" open={true}
                              onClose={(e) => {
                                  if (e.key === 'delete') {
                                      const keys = JsonDomHelper.selected.map(sel=>sel.props._key)
                                      keys.sort().reverse().forEach(key=>{
                                          this.removeByKey(key)
                                      })
                                      _onTemplateChange(_json, true)
                                  }

                                  this.setState({deleteSelectionConfirmDialog: null})
                                  this.enableEvents()
                                  this.deselectSelected()
                              }}
                              actions={deleteDialogActions}
                              title={_t('JsonDomHelper.confirm.deletion')}>
                    {_t('JsonDomHelper.delete.selected.question')}
                </SimpleDialog>
            )]
        } else {
            return <React.Fragment>{comp}
                {(deleteConfirmDialog &&
                    <SimpleDialog fullWidth={true} maxWidth="sm" key="deleteConfirmation" open={true}
                                  onClose={(e) => {
                                      if (e.key === 'delete') {
                                          this.handleDeleteClick()
                                      }

                                      this.setState({deleteConfirmDialog: null})
                                      this.enableEvents()
                                  }}
                                  actions={deleteDialogActions}
                                  title={_t('JsonDomHelper.confirm.deletion')}>
                        {_t('JsonDomHelper.delete.element.question')}
                    </SimpleDialog>
                )}
                {(deleteSourceConfirmDialog &&
                    <SimpleDialog fullWidth={true} maxWidth="sm" key="deleteSourceConfirmation" open={true}
                                  onClose={(e) => {
                                      if (e.key === 'delete') {
                                          const {type, _id} = deleteSourceConfirmDialog
                                          client.mutate({
                                                  mutation: `mutation delete${type}($_id: ID!) {delete${type}(_id: $_id) {_id status}}`,
                                                  variables: {_id},
                                                  update: (store, {data: {setKeyValue}}) => {
                                                      window.location.href = window.location.href
                                                  }
                                              }
                                          )

                                      }
                                      //JsonDomHelper.disableEvents = false
                                      this.setState({deleteSourceConfirmDialog: null})
                                  }}
                                  actions={deleteDialogActions}
                                  title={_t('JsonDomHelper.confirm.deletion')}>
                        {_t('JsonDomHelper.delete.element.question')}
                    </SimpleDialog>
                )}
                {(addChildDialog && <JsonDomAddElementDialog {...addChildDialog}
                    onSelectParent={({key})=>{
                        const parentKey = key.substring(0, key.lastIndexOf('.'))
                        if(parentKey) {
                            const subJsonParent = getComponentByKey(parentKey, _json)
                            this.handleEditElement({
                                jsonElement: subJsonParent?.$inlineEditor?.elementKey && getJsonDomElements(subJsonParent.$inlineEditor.elementKey),
                                subJson: subJsonParent,
                                isCms: subJsonParent?.$inlineEditor?.elementKey == 'cms',
                                json: _json,
                                key: parentKey
                            })
                        }
                    }} onClose={this.onAddChildDialogClose.bind(this)}/>)}</React.Fragment>
        }
    }

    createContextMenu({isCms, subJson, menuItems, hasJsonToEdit, parsedSource, _onDataResolverPropertyChange, overrideEvents, onChange, _options, _dynamic, rest, _json, isInLoop, isSelected}) {

        if(isSelected){
            menuItems.push({
                name: _t('JsonDomHelper.selection.delete'),
                icon: <DeleteIcon/>,
                onClick: () => {
                    JsonDomHelper.disableEvents = true
                    this.setState({deleteSelectionConfirmDialog: true})
                }
            })
            menuItems.push({
                name: _t('JsonDomHelper.element.to.clipboard'),
                icon: <FileCopyIcon/>,
                onClick: () => {
                    const allSubJsons = JsonDomHelper.selected.map(element=>{
                        subJson = getComponentByKey(element.props._key, element.props._json)
                        console.log(subJson)
                        return subJson
                    })
                    navigator.clipboard.writeText(JSON.stringify(allSubJsons, null, 2))
                    this.deselectSelected()
                    _app_.dispatcher.addNotification({horizontal:'right',
                        autoHideDuration:2200,
                        closeButton:false,
                        message: _t('JsonDomHelper.element.copied.to.clipboard',{length:allSubJsons.length})})
                }
            })
            return
        }
        if (hasJsonToEdit) {
            if (parsedSource) {

                if (_onDataResolverPropertyChange) {
                    overrideEvents.onChange = (e, ...args) => {
                        if (e.target === ReactDOM.findDOMNode(this)) {
                            _onDataResolverPropertyChange({
                                value: Util.escapeForJson(e.target.value),
                                path: parsedSource._id
                            })
                        }
                        if (onChange) {
                            onChange(e, ...args)
                        }
                    }
                }

                if (parsedSource._id) {
                    menuItems.push({
                        name: _options.menuTitle.source || 'Eintrag bearbeiten',
                        icon: <EditIcon/>,
                        onClick: this.handleDataSource.bind(this)
                    })
                }

                if (parsedSource.allowClone) {
                    menuItems.push({
                        name: _options.menuTitle.sourceClone || 'Eintrag kopieren',
                        icon: <FileCopyIcon/>,
                        onClick: (e) => {
                            this.handleDataSource(e, {clone: true})
                        }
                    })
                }

                if (parsedSource.allowNew) {
                    menuItems.push({
                        name: _options.menuTitle.sourceNew || 'Eintrag erstellen',
                        icon: <AddIcon/>,
                        onClick: (e) => {
                            this.handleDataSource(e, {create: true})
                        }
                    })
                }

                if (parsedSource.allowRemove) {
                    menuItems.push({
                        name: _options.menuTitle.sourceRemove || 'Eintrag löschen',
                        icon: <DeleteIcon/>,
                        onClick: (e) => {
                            this.setState({deleteSourceConfirmDialog: parsedSource})
                        }
                    })
                }

                if (_dynamic && _options.menu.edit !== false) {

                    const parent = this.props._scope.parent
                    const parentJson = parent.getJsonRaw(parent.props, true)

                    const parentSubJson = getComponentByKey(rest._rootKey, parentJson)

                    if (parentSubJson) {
                        menuItems.push({
                            name: 'Komponenten Einstellungen (Parent)',
                            icon: <SettingsInputComponentIcon/>,
                            onClick: () => {
                                this.handleEditElement({
                                    jsonElement: getJsonDomElements('Cms'),
                                    json: parentJson,
                                    subJson: parentSubJson,
                                    isCms: true,
                                    jsonDom: parent
                                })
                            }
                        })
                    }
                }

            }

            if (!_dynamic) {
                if (_options.menu.edit !== false && _options.elementKey) {
                    const jsonElement = getJsonDomElements(_options.elementKey)

                    if (jsonElement && (isCms || jsonElement.options || jsonElement.groupOptions || (subJson && subJson.$inlineEditor && subJson.$inlineEditor.options))) {

                        overrideEvents.onDoubleClick = () => {
                            this.handleEditElement({jsonElement, subJson, isCms, json: _json, key: rest._key})
                        }
                        menuItems.push({
                            name: _options.menuTitle.edit || _t('JsonDomHelper.elementSettings'),
                            icon: <SettingsInputComponentIcon/>,
                            onClick: overrideEvents.onDoubleClick
                        })
                    }
                }

                if (_options.menu.editTemplate !== false && Util.hasCapability(_app_.user, CAPABILITY_MANAGE_CMS_TEMPLATE)) {
                    menuItems.push({
                        name: _t('JsonDomHelper.edit.template'),
                        icon: <BuildIcon/>,
                        onClick: this.handleTemplateEditClick.bind(this)
                    })
                }

                if (_options.menu.clone !== false) {
                    menuItems.push({
                        name: _t('JsonDomHelper.copy.element'),
                        icon: <FileCopyIcon/>,
                        onClick: this.handleCopyClick.bind(this)
                    })
                }
                const canAddElement = (_options.allowDrop && _options.menu.add !== false) || _options.menu.addAbove !== false || _options.menu.addBelow !== false || _options.menu.wrap !== false

                if (!isInLoop) {
                    if(canAddElement) {

                        const subMenu = []
                        menuItems.push({
                            name: _t('JsonDomHelper.create.element'),
                            icon: <AddIcon/>,
                            items: subMenu
                        })

                        if (_options.allowDrop && _options.menu.add !== false) {
                            subMenu.push({
                                name: _t('JsonDomHelper.element.inside'),
                                icon: <AddIcon/>,
                                onClick: () => {
                                    JsonDomHelper.disableEvents = true
                                    this.setState({addChildDialog: {currentElement: null, showElementSelector: true}})
                                }
                            })
                        }

                        if (_options.menu.addAbove !== false) {

                            subMenu.push({
                                name: _t('JsonDomHelper.element.above'),
                                icon: <PlaylistAddIcon/>,
                                onClick: () => {
                                    JsonDomHelper.disableEvents = true
                                    this.setState({
                                        addChildDialog: {
                                            currentElement: null,
                                            payload: {addabove: true},
                                            showElementSelector: true
                                        }
                                    })
                                }
                            })
                        }

                        if (_options.menu.addBelow !== false) {
                            subMenu.push({
                                name: _t('JsonDomHelper.element.below'),
                                icon: <PlaylistAddIcon/>,
                                onClick: () => {
                                    JsonDomHelper.disableEvents = true
                                    this.setState({
                                        addChildDialog: {
                                            currentElement: null,
                                            payload: {addbelow: true},
                                            showElementSelector: true
                                        }
                                    })
                                }
                            })
                        }
                        if (_options.menu.wrap !== false) {
                            subMenu.push({
                                name: _t('JsonDomHelper.element.outside'),
                                icon: <FlipToBackIcon/>,
                                onClick: () => {
                                    JsonDomHelper.disableEvents = true
                                    this.setState({
                                        addChildDialog: {
                                            payload: {json: _json, subJson, wrap: true},
                                            currentElement: null,
                                            showElementSelector: true
                                        }
                                    })
                                }
                            })
                        }
                    }
                }

                const subMenuMove = []
                const parentKey = rest._key.substring(0,rest._key.lastIndexOf('.'))
                const parentJson = getComponentByKey(parentKey, _json)
                if(parentJson &&
                    _options.menu.move !== false &&
                    parentJson !==subJson && parentJson.c &&
                    parentJson.c.constructor === Array){
                    const currentIndex = parentJson.c.indexOf(subJson)
                    if(currentIndex>0) {
                        subMenuMove.push({
                            name: _t('JsonDomHelper.move.element.up'),
                            icon: <MoveUpIcon/>,
                            onClick: () => {
                                this.moveElementFromTo(rest._key, parentKey, currentIndex-1, _json, subJson)
                            }
                        })
                    }
                    if(currentIndex+1<parentJson.c.length) {
                        subMenuMove.push({
                            name: _t('JsonDomHelper.move.element.down'),
                            icon: <MoveDownIcon/>,
                            onClick: () => {
                                this.moveElementFromTo(rest._key, parentKey, currentIndex+2, _json, subJson)
                            }
                        })
                    }

                    if(subMenuMove.length>0) {
                        menuItems.push({
                            name: _t('JsonDomHelper.move.element'),
                            icon: <LowPriorityIcon/>,
                            items: subMenuMove
                        })
                    }
                }

                if(_options.menu.addSpace !== false){
                    if(this.state.marginBottom==='0px') {
                        menuItems.push({
                            name: _t('JsonDomHelper.element.addMarginBottom'),
                            icon: 'horizontalSplit',
                            onClick: () => {
                                setPropertyByPath('2rem', 'p.style.marginBottom', subJson)
                                this.props._onTemplateChange(_json, true)
                            }
                        })
                    }else{
                        menuItems.push({
                            name: _t('JsonDomHelper.element.removeMarginBottom'),
                            icon: 'horizontalSplit',
                            onClick: () => {
                                setPropertyByPath('0px', 'p.style.marginBottom', subJson)
                                this.props._onTemplateChange(_json, true)
                            }
                        })
                    }
                }

                if(_options.menu.convert !== false &&
                    (!_options.elementKey || CONVERTABLE_ELEMENTS.indexOf(_options.elementKey) >= 0)){
                    this.addConversionToMenu(subJson, _json, _options, menuItems)
                }

                if (_options.menu.remove !== false) {
                    menuItems.push({
                        name: _t('JsonDomHelper.delete.element'),
                        icon: <DeleteIcon/>,
                        onClick: () => {
                            JsonDomHelper.disableEvents = true
                            this.setState({deleteConfirmDialog: true})
                        }
                    })
                }

                if (_options.menu.clipboard !== false) {
                    menuItems.push({
                        divider: true,
                        name: _t('JsonDomHelper.element.to.clipboard'),
                        icon: <FileCopyIcon/>,
                        onClick: () => {
                            navigator.clipboard.writeText(JSON.stringify(subJson, null, 2))
                            _app_.dispatcher.addNotification({horizontal:'right',
                                autoHideDuration:2200,
                                closeButton:false,
                                message: _t('JsonDomHelper.element.copied.to.clipboard',{length:1})})
                        }
                    })

                    if(canAddElement) {

                        const subItems = []

                        if (_options.allowDrop && _options.menu.add !== false) {
                            subItems.push({
                                name: _t('JsonDomHelper.element.inside'),
                                icon: <PlaylistAddIcon/>,
                                onClick: () => {
                                    this.insertFromClipboard(rest,'inside')
                                }
                            })
                        }

                        if (_options.menu.addAbove !== false) {
                            subItems.push({
                                name: _t('JsonDomHelper.element.above'),
                                icon: <PlaylistAddIcon/>,
                                onClick: () => {
                                    this.insertFromClipboard(rest,'above')
                                }
                            })
                        }

                        if (_options.menu.addBelow !== false) {
                            subItems.push({
                                name: _t('JsonDomHelper.element.below'),
                                icon: <PlaylistAddIcon/>,
                                onClick: () => {
                                    this.insertFromClipboard(rest,'below')
                                }
                            })
                        }

                        menuItems.push({
                            name: _t('JsonDomHelper.element.from.clipboard'),
                            icon: <FileCopyIcon/>,
                            items: subItems
                        })
                    }
                }
            }
        }


        if (isCms && subJson && subJson.p) {

            const slug = subJson.p.component && subJson.p.component.length > 0 ? subJson.p.component[0].slug : subJson.p.slug

            if(slug !== null && slug !== undefined) {
                menuItems.push({
                    name: _t('JsonDomHelper.openComponent', {slug: subJson.p.id || slug}),
                    icon: <LaunchIcon/>,
                    divider:true,
                    onClick: () => {
                        this.props.history.push('/' + slug)
                    }
                })
            }
        }
    }

    addConversionToMenu(subJson, _json, _options, menuItems) {
        const changeToType = (type) => {
            const customElement = getJsonDomElements(type)
            subJson.$inlineEditor = replaceUidPlaceholder(customElement.defaults.$inlineEditor)
            subJson.p = Object.assign({}, subJson.p, customElement.defaults.p)
            if (type.startsWith('layout-')) {
                if (subJson.c.length < customElement.defaults.c.length) {
                    for (let i = subJson.c.length; i <= customElement.defaults.c.length; i++) {
                        subJson.c[i] = customElement.defaults.c[i]
                    }
                } else {
                    subJson.c.length = customElement.defaults.c.length
                }
            }
            if (customElement.options) {
                Object.keys(customElement.options).forEach(optKey => {
                    if (customElement.options[optKey].value !== undefined) {
                        const prop = propertyByPath(optKey, subJson, '_')
                        if (prop === undefined || prop === null || customElement.options[optKey].forceOverride) {
                            setPropertyByPath(customElement.options[optKey].value, optKey, subJson, '_')
                        }
                    }
                })
            }
            this.props._onTemplateChange(_json, true)
        }

        const items = []
        if (['richText','p','headline'].indexOf(_options.elementKey)>=0) {

            if (['richText', 'headline'].indexOf(_options.elementKey) >= 0) {
                items.push({
                    name: _t('elements.key.p'),
                    icon: 'subject',
                    onClick: () => {
                        subJson.t = 'p'
                        delete subJson.p['data-element-key']
                        changeToType('p')
                    }
                })
            }
            if (['p', 'headline'].indexOf(_options.elementKey) >= 0) {
                items.push({
                    name: _t('elements.key.richText'),
                    icon: 'wysiwyg',
                    onClick: () => {
                        subJson.$c = subJson.$c ? `<p>${subJson.$c}</p>` : `<${subJson.t}>${subJson.c}</${subJson.t}>`
                        subJson.t = 'div'
                        delete subJson.c
                        changeToType('richText')
                    }
                })
            }

            if (['richText', 'p'].indexOf(_options.elementKey) >= 0) {
                items.push({
                    name: _t('elements.key.headline'),
                    icon: 'format',
                    onClick: () => {
                        subJson.c = subJson.c || (subJson.$c?subJson.$c.replace(/<[^>]*>/g, ''):'')
                        subJson.t = 'h1'
                        delete subJson.$c
                        changeToType('headline')
                    }
                })
            }

        }else if (_options?.elementKey?.startsWith('layout-')) {
            const layouts = ['layout-1-2', 'layout-1-3', 'layout-1-4', 'layout-1-6']
            layouts.forEach(layout => {
                if (layout == _options.elementKey) {
                    return
                }
                items.push({
                    name: _t(`elements.key.${layout}`),
                    icon: 'viewColum',
                    onClick: () => {
                        // subJson.c = [{...subJson,$inlineEditor:false}]
                        //subJson.t = 'Link'
                        // delete subJson.p
                        changeToType(layout)
                    }
                })

            })

        } else if (_options.elementKey == 'image') {
            items.push({
                name: _t('elements.key.imageLink'),
                icon: 'datasetLink',
                onClick: () => {
                    subJson.c = [{...subJson, $inlineEditor: false}]
                    subJson.t = 'Link'
                    delete subJson.p
                    changeToType('imageLink')
                }
            })
        } else {
            items.push({
                name: 'Custom container',
                onClick: () => {
                    changeToType('custom')
                }
            })
            items.push({
                name: 'Headline',
                onClick: () => {
                    changeToType('headline')
                }
            })
        }

        menuItems.push({
            name: _t('JsonDomHelper.convert.element'),
            icon: <TransformIcon/>,
            items
        })
    }

    insertFromClipboard(rest,place) {
        navigator.clipboard.readText().then(text => {
            if (text) {
                try {
                    const json = JSON.parse(text)
                    const addData = {newKeys:true}
                    if(place==='above'){
                        addData.index = parseInt(rest._key.substring(rest._key.lastIndexOf('.') + 1))
                    }else if(place==='below'){
                        addData.index = parseInt(rest._key.substring(rest._key.lastIndexOf('.') + 1)) + 1
                    }
                    this.handleAddChildClick(json, addData)
                } catch (e) {
                }
            }
        }).catch(err => {
            console.log('Something went wrong', err)
        })
    }

    addDropAreasToChildren({children, hasJsonToEdit, isInLoop, _options}) {
        let kids
        if ((!children || children.constructor !== String) && hasJsonToEdit && !isInLoop && _options.allowDrop && _options.dropArea !== false) {
            kids = []
            if (children && children.length) {

                let index = -1
                for (let i = 0; i < children.length; i++) {
                    if(children[i]) {
                        if (children[i].key) {
                            index = parseInt(children[i].key.substring(children[i].key.lastIndexOf('.') + 1))

                            if (!_options.excludeDrop || _options.excludeDrop.indexOf(index) < 0) {
                                kids.push(this.getDropArea(this.props, index))
                            }
                        }
                        kids.push(children[i])
                    }
                }
                if (index > -1) {
                    kids.push(this.getDropArea(this.props, index + 1))
                }

            } else {
                kids.push(this.getDropArea(this.props, 0,true))
            }

        } else {
            return children
        }
        return kids
    }

    deselectSelected(){
        if(JsonDomHelper.selected.length===0){
            return
        }
        const selected = JsonDomHelper.selected
        JsonDomHelper.selected = []
        selected.forEach(select=>{
            select.forceUpdate()
        })
    }

    handleEditElement({jsonElement, subJson, isCms, json, jsonDom, key}) {
        JsonDomHelper.disableEvents = true
        this.deselectSelected()
        //clone
        const newJsonElement = JSON.parse(JSON.stringify(jsonElement))
        delete newJsonElement.defaults

        newJsonElement.options = deepMerge({}, newJsonElement.options, subJson.$inlineEditor && subJson.$inlineEditor.options)
        newJsonElement.groupOptions = deepMerge({}, newJsonElement.groupOptions, subJson.$inlineEditor && subJson.$inlineEditor.groupOptions)

        if(subJson.$inlineEditor && subJson.$inlineEditor.groupOptions){
            // sort by position attribute
            Object.entries(newJsonElement.groupOptions).forEach(([groupKey,groupValue])=>{
                newJsonElement.groupOptions[groupKey] = Object.entries(groupValue).map(([key,value],index) =>{
                    if(value.position===undefined){
                        value.position = index+1
                    }
                    return [key,value]
                }).sort(([,valueA],[,valueB]) => {
                    return valueA.position - valueB.position
                }).reduce((r, [k, v]) => ({ ...r, [k]: v }), {})
            })
        }

        Object.keys(newJsonElement.options).forEach(key => {

            if(!newJsonElement.options[key]){
                return
            }

            let val = propertyByPath('$original_' + key, subJson, '_')
            if (!val) {
                val = propertyByPath(key, subJson, '_')
            }
            if(key==='$inlineEditor_dataResolver'){
               val = this.props._findSegmentInDataResolverByKeyOrPath({key:val}).segment
            }

            if (newJsonElement.options[key].tr && newJsonElement.options[key].trKey) {
                if (this.props._scope.data.tr) {
                    const trEl = this.props._scope.data.tr[newJsonElement.options[key].trKey]
                    newJsonElement.options[key].value = trEl ? trEl.replace(/\\"/g, '"').replace(/\\n/g, '\n') : ''
                }
            } else {
                newJsonElement.options[key].value = val
            }
        })

        Object.keys(newJsonElement.groupOptions).forEach(key => {
            let val = propertyByPath(key, subJson, '_')

            if (val && val.constructor === Array) {
                newJsonElement.options['!' + key + '!add'] = {
                    uitype: 'button',
                    key,
                    group: newJsonElement.groupOptions[key],
                    label: 'Hinzufügen',
                    action: 'add',
                    newLine: true,
                    tab: 'Slides',
                    tabPosition: 0,
                    style: {marginBottom: '2rem'},
                    ...newJsonElement.groupOptions[key]._addButton
                }

                val.forEach((groupValue, idx) => {
                    Object.keys(newJsonElement.groupOptions[key]).forEach(fieldKey => {
                        if (fieldKey !== '_addButton') {
                            const groupFieldOption = newJsonElement.groupOptions[key][fieldKey]
                            let groupFieldValue
                            if (groupFieldOption.tr && groupFieldOption.trKey) {
                                if (this.props._scope.data.tr) {
                                    const trKey = groupValue.trKey || (groupFieldOption.trKey + '-' + idx)
                                    groupFieldValue = this.props._scope.data.tr[trKey]
                                }
                            } else {
                                groupFieldValue = groupValue[fieldKey]
                            }
                            const optKey = '!' + key + '!' + fieldKey + '!' + idx,
                                optData = {
                                    ...newJsonElement.groupOptions[key][fieldKey],
                                    value: groupFieldValue
                                }
                            if (optData.expandable && optData.expandable.constructor === String) {
                                optData.expandable += ' ' + (idx + 1)

                                if(groupFieldValue){
                                    if(groupFieldValue.constructor === String){
                                        optData.expandable += ' (' + groupFieldValue.substring(0, 20) + ')'
                                    }else if(groupFieldValue.constructor === Object && groupFieldOption.localized && groupFieldValue[_app_.lang]){
                                        optData.expandable += ' (' + groupFieldValue[_app_.lang].substring(0, 20) + ')'
                                    }
                                }
                            }

                            newJsonElement.options[optKey] = optData

                            if (optData.expandable === false) {
                                delete optData.expandable
                                newJsonElement.options['!' + key + '!delete!' + idx] = {
                                    uitype: 'button',
                                    label: 'Löschen',
                                    action: 'delete',
                                    key,
                                    group: newJsonElement.groupOptions[key],
                                    index: idx,
                                    newLine: true,
                                    expandable: false
                                }
                            }
                        }
                    })
                })
            }
        })


        if (isCms) {
            this.setFormOptionsByProperties(subJson.p, newJsonElement.options, 'p_')
        }
        this.setState({
            toolbarHovered: false,
            hovered: false,
            dragging: false,
            addChildDialog: {currentElement: newJsonElement, payload: {json, subJson, jsonDom, key, edit: true}}
        })
    }

    onAddChildDialogClose(event, currentElement, form, payload = {}){
        const {_onTemplateChange, _onDataResolverPropertyChange, _key} = this.props


        if (event.key === 'save' && currentElement) {

            let comp = currentElement.tagName ? {'t': currentElement.tagName, ...currentElement.defaults} : currentElement
            if (payload.edit) {
                // merge existing component
                comp = deepMergeOptional({
                    mergeArray: true,
                    arrayCutToLast: true
                }, comp, payload.subJson)
            }


            if (form) {
                const fields = form.state.fields
                let groupKeyMap = {}
                Object.keys(fields).forEach(key => {
                    let val = fields[key]
                    if (key.startsWith('!')) {
                        // group Options
                        const parts = key.split('!'),
                            groupKey = parts[1], groupProp = parts[2],
                            groupIdx = parseInt(parts[3])

                        if (!isNaN(groupIdx) && currentElement.groupOptions[groupKey]) {

                            if (currentElement.groupOptions[groupKey][groupProp]) {

                                const groupFieldOption = Object.assign({},
                                    currentElement.groupOptions[groupKey][groupProp],
                                    comp.$inlineEditor && comp.$inlineEditor.groupOptions && comp.$inlineEditor.groupOptions[groupKey] && comp.$inlineEditor.groupOptions[groupKey][groupProp])

                                let groupArray = groupKeyMap[groupKey]

                                if(!groupArray){
                                    groupKeyMap[groupKey] = groupArray = []
                                }

                                let groupData
                                if(!groupArray[groupIdx]){
                                    const prevGroupArray = propertyByPath(groupKey, comp, '_')
                                    if(prevGroupArray && prevGroupArray[groupIdx]){
                                        groupData = Object.assign({},prevGroupArray[groupIdx])
                                    }else{
                                        groupData = {}
                                    }
                                    groupArray[groupIdx] = groupData
                                }else{
                                    groupData = groupArray[groupIdx]
                                }

                                if (groupFieldOption.tr && groupFieldOption.trKey) {

                                    if(!groupData.trKey){
                                        groupData.trKey = `${groupFieldOption.trKey}-${groupIdx}-${Math.random().toString(36).substr(2, 9)}`
                                    }

                                    groupData[groupProp] = `$\{Util.escapeForJson(_t('${groupData.trKey}'))\}`
                                    if (val !== null) {
                                        // update translation
                                        _onDataResolverPropertyChange({
                                            value: Util.escapeForJson(val.replace(/\n/g, '')),
                                            path: 'tr.' + _app_.lang + '.' + groupData.trKey,
                                            instantSave: true
                                        })
                                    }
                                } else {
                                    groupData[groupProp] = val
                                }
                            }
                        }
                    } else {

                        const currentOpt = Object.assign({},
                            currentElement.options && currentElement.options[key],
                            comp.$inlineEditor && comp.$inlineEditor.options && comp.$inlineEditor.options[key])

                        const hasValue = (val !== undefined && val !== null)

                        if (currentOpt.template && (currentOpt.invisible || hasValue)) {
                            if(hasValue) {
                                setPropertyByPath(val, '$original_' + key, comp, '_')
                                val = Util.replacePlaceholders(currentOpt.template, {_comp: comp, ...(val.constructor === String ? {data: val} : val[0])})
                            }else{
                                val = Util.replacePlaceholders(currentOpt.template, {_comp: comp})
                            }
                        }

                        if (currentOpt.tr && currentOpt.trKey) {
                            if (val !== null) {

                                if(!fields.$toHtml){
                                    val = val.replace(/\n/g, '')
                                }

                                if(currentOpt.trGlobal) {
                                    // handle global tr
                                }else{
                                    _onDataResolverPropertyChange({
                                        value: Util.escapeForJson(Util.escapeForJson(val)),
                                        path: 'tr.' + _app_.lang + '.' + currentOpt.trKey,
                                        instantSave: true
                                    })
                                }
                            }
                            setPropertyByPath(`$\{_t('${currentOpt.trKey}'${currentOpt.trContext?','+currentOpt.trContext:''})\}`, key, comp, '_')

                        } else if(val!=null && val!=undefined){
                            setPropertyByPath(val, key, comp, '_')
                        }
                    }
                })

                Object.keys(groupKeyMap).forEach(groupKey=>{
                    setPropertyByPath(groupKeyMap[groupKey], groupKey, comp, '_')
                })
            }


            if (payload.edit) {

                Object.keys(comp).forEach((key) => {
                    if(comp[key]!==undefined && comp[key]!==null) {
                        const dataResolver = comp[key].dataResolver
                        if (dataResolver) {
                            if (dataResolver.constructor === Object) {
                                _onDataResolverPropertyChange({
                                    value: dataResolver,
                                    key: dataResolver.key,
                                    instantSave: true
                                })
                                comp[key].dataResolver = dataResolver.key
                            }
                        }
                        payload.subJson[key] = comp[key]
                    }
                })

                Util.removeNullValues(payload.subJson, {
                    recursiv: true,
                    emptyObject: true,
                    emptyArray: true,
                    nullArrayItems: true
                })

                if (payload.subJson.$inlineEditor && payload.subJson.$inlineEditor.options) {
                    Object.keys(payload.subJson.$inlineEditor.options).forEach(optKey => {
                        delete payload.subJson.$inlineEditor.options[optKey].value
                    })
                }

                if(payload.jsonDom){
                    payload.jsonDom.props.onTemplateChange(payload.json, true)
                }else {
                    _onTemplateChange(payload.json, true)
                }

            } else {

                Util.removeNullValues(comp, {
                    recursiv: true,
                    emptyObject: true,
                    emptyArray: true,
                    nullArrayItems: true
                })

                if (payload.wrap) {
                    const wrapped = Object.assign({}, payload.subJson)

                    Object.keys(payload.subJson).forEach((key) => {
                        delete payload.subJson[key]
                    })


                    Object.keys(comp).forEach((key) => {
                        payload.subJson[key] = comp[key]
                    })
                    payload.subJson.c = [wrapped]

                    _onTemplateChange(payload.json, true)
                } else {

                    // add new
                    let pos
                    // determine position to insert in parent node
                    if (payload.addbelow) {
                        pos = parseInt(_key.substring(_key.lastIndexOf('.') + 1)) + 1
                    } else if (payload.addabove) {
                        pos = parseInt(_key.substring(_key.lastIndexOf('.') + 1))
                    }

                    this.handleAddChildClick(comp, {index:pos, dropIndex: payload.dropIndex})
                }
            }
        }
        JsonDomHelper.disableEvents = false
        this.setState({addChildDialog: null})
    }
}

/*

JsonDomHelper.propTypes = {
    _cmsActions: PropTypes.object.isRequired,
    _WrappedComponent: PropTypes.any.isRequired,
    _key: PropTypes.string.isRequired,
    _scope: PropTypes.object.isRequired,
    _json: PropTypes.any,
    _onTemplateChange: PropTypes.func,
    _onDataResolverPropertyChange: PropTypes.func,
    _inlineEditor: PropTypes.bool
}
*/


export default JsonDomHelper
