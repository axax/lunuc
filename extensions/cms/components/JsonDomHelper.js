import React from 'react'
import ReactDOM from 'react-dom'
import PropTypes from 'prop-types'
import {
    SimpleSelect,
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
    FlipToBackIcon
} from 'ui/admin'
import GenericForm from 'client/components/GenericForm'
import AddToBody from './AddToBody'
import DomUtilAdmin from 'client/util/domAdmin.mjs'
import Util from 'client/util/index.mjs'
import {propertyByPath, setPropertyByPath} from '../../../client/util/json.mjs'
import {getComponentByKey, addComponent, removeComponent, getParentKey, isTargetAbove} from '../util/jsonDomUtil'
import config from 'gen/config-client'
import {getJsonDomElements, MEDIA_PROJECTION} from '../util/elements'
import {deepMergeOptional, deepMerge} from '../../../util/deepMerge.mjs'
import {CAPABILITY_MANAGE_CMS_TEMPLATE} from '../constants/index.mjs'
import {client} from '../../../client/middleware/graphql'
import {openWindow} from '../../../client/util/window'
import {convertRawValuesFromPicker} from '../../../client/util/picker'
import {showTooltip} from '../../../client/util/tooltip'
import styled from '@emotion/styled'

const {UPLOAD_URL, DEFAULT_LANGUAGE} = config


const StyledHighlighter = styled('span')(({ color }) => ({
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
    boxShadow: '0px 0px 5px 0px rgba(235,252,0,1)',
    ...(color==='yellow' && {
        background: 'rgba(245, 245, 66,0.05)'
    }),
    ...(color==='blue' && {
        background: 'rgba(84, 66, 245,0.1)',
        color: 'black',
        fontWeight: 'bold',
        fontSize: '0.9rem',
        textShadow: '1px 1px 2px white'
    }),
}))

const DROPAREA_ACTIVE = 'jdh-da-active'
const DROPAREA_OVERLAP = 'jdh-da-overlap'
const DROPAREA_OVER = 'jdh-da-over'
const StyledDropArea = styled('span')({
    overflow: 'hidden',
    whiteSpace: 'pre',
    transition: 'display .5s ease-out,visibility .5s ease-out, opacity .5s ease-out',
    opacity: 0,
    zIndex: 999,
    display: 'table',
    visibility: 'hidden',
    position: 'absolute',
    fontWeight: 'bold',
    borderRadius: '5px',
    background: '#000',
    padding: '0',
    maxWidth: '100%',
    margin: '-28px 0 0 0 !important',
    border: '1px dashed #c1c1c1',
    height: '28px',
    lineHeight: '28px',
    color: '#fff',
    textAlign: 'center',
    fontSize: '1rem',
    '&:after': {
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
    },
    [`&.${DROPAREA_ACTIVE}`]:{
        visibility: 'visible',
        opacity: 0.8
    },
    [`&.${DROPAREA_OVERLAP}`]:{
        position: 'relative',
        marginTop: '0px !important',
    },
    [`&.${DROPAREA_OVER}`]:{
        zIndex: 1000,
        opacity: '1 !important',
        visibility: 'visible !important',
        background: 'red',
        '&:after': {
            borderTopColor: 'red'
        }
    }
})


const StyledPicker = styled('div')({
    cursor: 'pointer',
    pointerEvents: 'auto'
})

const StyledToolbarButton = styled('div')({
    zIndex: 999,
    position: 'fixed',
    maxHeight: '200px'
})

const StyledToolbarMenu = styled(SimpleMenu)({
    position: 'absolute',
    left: '-2.2rem',
    top: 'calc(50% - 1.5rem)'
})

const StyledInfoBox = styled('div')({
    position: 'fixed',
    bottom: '0px',
    right: '0px',
    background: '#fff',
    padding: '3px',
    zIndex: 99999
})


const ALLOW_DROP = ['div', 'main', 'Col', 'Row', 'section', 'Cms', 'Print', 'td']
const ALLOW_DROP_IN = {'Col': ['Row'], 'li': ['ul']}
const ALLOW_DROP_FROM = {'Row': ['Col']}

let aftershockTimeout
const highlighterHandler = (e, observer, after) => {
    const hightlighter = document.querySelector('[data-highlighter]')
    if (hightlighter) {
        const key = hightlighter.getAttribute('data-highlighter')
        const node = document.querySelector('[_key="' + key + '"]')

        if (node) {
            const offset = DomUtilAdmin.elemOffset(node)
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
            for (let i = 0; i < 10; i++) {
                setTimeout(() => {
                    highlighterHandler(e, observer, true)
                }, i * 50)
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
    JsonDomHelper.disabledSelect.forEach(el => {
        el.disabled = false
    })
}
document.addEventListener('keyup', (e) => {
    if (e.key === 'Alt') {
        altKeyReleased()
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

        if (!hovered) {
            const stat = {
                hovered: true,
                height: node.offsetHeight,
                width: node.offsetWidth, ...DomUtilAdmin.elemOffset(node)
            }
            this.helperTimeoutIn = setTimeout(() => {
                this.setState(stat)
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
                this.onHelperMouseOut()
            }, 100)
            return
        }

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
        if (!JsonDomHelper.currentDragElement) {
            JsonDomHelper.currentDragElement = this
            this.setState({toolbarHovered: false, hovered: false, dragging: true})
        }
    }

    _clientY = 0
    _clientX = 0
    _onDragTimeout = 0

    onDrag(e) {
        e.stopPropagation()
        if (e.clientY > 0 && Math.abs(e.clientY - this._clientY) > 25) {

            this._clientX = e.clientX
            this._clientY = e.clientY
            clearTimeout(this._onDragTimeout)

            const draggable = ReactDOM.findDOMNode(JsonDomHelper.currentDragElement)
            this._onDragTimeout = setTimeout(() => {

                if (!JsonDomHelper.currentDragElement) {
                    return
                }

                /*const elementOnMouseOver = document.elementFromPoint(this._clientX, this._clientY)*/

                const tags = document.querySelectorAll('[data-drop-area="true"]')

                const dragableProps = JsonDomHelper.currentDragElement.props

                const allowDropIn = ALLOW_DROP_IN[dragableProps._tagName]

                const allTags = []
                for (let i = 0; i < tags.length; ++i) {
                    const tag = tags[i]
                    if (draggable === tag.nextSibling ||
                        draggable === tag.previousSibling ||
                        (dragableProps._options.leaveParent === false && draggable.parentNode !== tag.parentNode) /*|| !elementOnMouseOver.contains(tag)*/) {
                        tag.classList.remove(DROPAREA_ACTIVE)
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

                    if (node.nodeType !== Node.TEXT_NODE && JsonDomHelper.currentDragElement && !draggable.contains(node)) {
                        const tagName = tag.getAttribute('data-tag-name')
                        if (!allowDropIn || allowDropIn.indexOf(tagName) >= 0) {


                            const allowDropFrom = ALLOW_DROP_FROM[tagName]
                            if (!allowDropFrom || allowDropFrom.indexOf(dragableProps._tagName) >= 0) {
                                const pos = DomUtilAdmin.elemOffset(node)
                                const distanceTop = Math.abs(this._clientY - pos.top)
                                const distanceMiddle = Math.abs(this._clientY - (pos.top + node.offsetHeight / 2))
                                const distanceBottom = Math.abs(this._clientY - (pos.top + node.offsetHeight))


                                if (distanceTop < 100 || distanceMiddle < 100 || distanceBottom < 100) {

                                    const nodeForWidth = ['DIV'].indexOf(node.tagName) < 0 ? node.parentNode : node

                                    const computedStyle = window.getComputedStyle(nodeForWidth, null)


                                    let elementWidth = nodeForWidth.clientWidth
                                    elementWidth -= parseFloat(computedStyle.paddingLeft) + parseFloat(computedStyle.paddingRight)


                                    tag.classList.add(DROPAREA_ACTIVE)
                                    tag.style.width = (elementWidth) + 'px'
                                    allTags.push(tag)

                                } else {
                                    if (distanceTop > 200 && distanceMiddle > 200 && distanceBottom > 200) {
                                        tag.classList.remove(DROPAREA_ACTIVE)
                                    } else {
                                        allTags.push(tag)
                                    }
                                }
                            }
                        }
                    }
                }


                // check for overlapping elements
                for (let y = 0; y < allTags.length; y++) {
                    for (let z = 0; z < allTags.length; z++) {
                        if (allTags[y] !== allTags[z]) {
                            const rect = allTags[y].getBoundingClientRect()
                            const rect2 = allTags[z].getBoundingClientRect()
                            if (!(rect.right < rect2.left ||
                                rect.left > rect2.right ||
                                rect.bottom < rect2.top ||
                                rect.top > rect2.bottom)) {

                                allTags[z].classList.add(DROPAREA_OVERLAP)
                                allTags[y].classList.add(DROPAREA_OVERLAP)
                                break
                            }
                        }
                    }
                }

            }, 100) // prevent flickering
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

        if (JsonDomHelper.currentDragElement) {
            let sourceKey = JsonDomHelper.currentDragElement.props._key,
                sourceIndex = parseInt(sourceKey.substring(sourceKey.lastIndexOf('.') + 1)),
                sourceParentKey = getParentKey(sourceKey),
                targetKey = e.currentTarget.getAttribute('data-key'),
                targetIndex = parseInt(e.currentTarget.getAttribute('data-index'))

            if (targetKey) {
                // 1. get element from json structure by key
                const source = getComponentByKey(sourceKey, _json)
                if (source) {
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

            }
        }
        setTimeout(() => {

            JsonDomHelper.disableEvents = false
        }, 200)

        this.resetDragState()
    }


    resetDragState() {

        const dropAreas = document.querySelectorAll('[data-drop-area="true"]')
        for (let i = 0; i < dropAreas.length; ++i) {
            const dropArea = dropAreas[i]
            dropArea.classList.remove(DROPAREA_OVERLAP)
            dropArea.classList.remove(DROPAREA_OVER)
            dropArea.classList.remove(DROPAREA_ACTIVE)
        }

        JsonDomHelper.currentDragElement = null
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
        const {_cmsActions, _onTemplateChange, _key, _json, _scope} = this.props

        const source = getComponentByKey(_key, _json)

        if (source) {

            //
            const trKeys = []
            DomUtilAdmin.findProperties(source, 'trKey').forEach(({element}) => {
                trKeys.push(element.trKey)
            })

            let finalSource
            if (trKeys.length > 0) {
                let sourceStr = JSON.stringify(source)
                trKeys.forEach(key => {
                    const newKey = 'genid_' + Math.random().toString(36).substr(2, 9)
                    sourceStr = sourceStr.replace(new RegExp(key, "g"), newKey)
                })
                finalSource = JSON.parse(sourceStr)
            } else {
                finalSource = source
            }


            const key = getParentKey(_key)
            let index = parseInt(_key.substring(_key.lastIndexOf('.') + 1))
            if (isNaN(index)) {
                index = -1
            } else {
                index++
            }
            addComponent({key, json: _json, index, component: finalSource})
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

    handleAddChildClick(component, index) {
        const {_key, _json, _onTemplateChange, _onDataResolverPropertyChange} = this.props

        let newkey = _key
        if (index !== undefined) {
            newkey = newkey.substring(0, newkey.lastIndexOf('.'))
        } else {
            index = 0
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
        addComponent({key: newkey, json: _json, index, component})
        _onTemplateChange(_json)
    }


    handleDeleteClick(e) {
        const {_cmsActions, _key, _json, _scope, _onTemplateChange, _onDataResolverPropertyChange} = this.props
        const source = getComponentByKey(_key, _json)

        if (source && source.$inlineEditor && source.$inlineEditor.dataResolver) {
            _onDataResolverPropertyChange({value: null, key: source.$inlineEditor.dataResolver})
        }
        removeComponent(_key, _json)
        _onTemplateChange(_json, true)
    }


    getDropArea(rest, index) {
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
            key={`${rest._key}.dropArea.${index}`}>Hier plazieren</StyledDropArea>
    }

    openPicker(options) {
        const picker = options.picker
        const {_onTemplateChange, _key, _json} = this.props

        const newwindow = openWindow({url:`${_app_.lang !== DEFAULT_LANGUAGE ? '/' + _app_.lang : ''}/admin/types/?noLayout=true&fixType=${picker.type}&baseFilter=${encodeURIComponent(picker.baseFilter || '')}`})


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
                            const jsonElement = getJsonDomElements(options.elementKey)
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
        const {_WrappedComponent, _json, _cmsActions, _onTemplateChange, _onDataResolverPropertyChange, children, _tagName, _options, _user, _inlineEditor, _dynamic, onChange, onClick, ...rest} = this.props
        const {hovered, toolbarHovered, toolbarMenuOpen, addChildDialog, deleteConfirmDialog, deleteSourceConfirmDialog} = this.state

        if(!rest._key){
            return
        }
        const menuItems = [],
            isCms = _tagName === 'Cms',
            isInLoop = rest._key.indexOf('$loop') >= 0,
            isElementActive = !JsonDomHelper.disableEvents && (hovered || toolbarHovered || toolbarMenuOpen)

        let hasJsonToEdit = !!_json, subJson, toolbar, highlighter, dropAreaAbove, dropAreaBelow, editElementEvent,
            overrideOnChange, overrideOnClick, parsedSource

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
            events.onDrag = this.onDrag.bind(this)
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
            overrideOnClick = (e) => {
                this.handleDataSource(e, {create: true})
            }
        }


        if (isElementActive) {

            if (isCms && subJson && subJson.p && subJson.p.slug !== null) {
                menuItems.push({
                    name: `Komponente ${subJson.p.id || subJson.p.slug} öffnen`,
                    icon: <LaunchIcon/>,
                    onClick: () => {
                        this.props.history.push('/' + subJson.p.slug)
                    }
                })
            }
            if (hasJsonToEdit) {


                if (parsedSource) {

                    if (_onDataResolverPropertyChange) {
                        overrideOnChange = (e, ...args) => {
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



                    if(_dynamic) {

                        const parent = rest._scope.parent
                        const parentJson = parent.getJsonRaw(parent.props, true)

                        const parentSubJson = getComponentByKey(rest._rootKey, parentJson)

                        if (parentSubJson) {
                            menuItems.push({
                                name: 'Komponenten Einstellungen',
                                icon: <SettingsInputComponentIcon/>,
                                onClick: () => {
                                    this.handleEditElement({jsonElement: getJsonDomElements('Cms'), json: parentJson, subJson: parentSubJson, isCms: true, jsonDom:parent})
                                }
                            })
                        }
                    }

                }

                if(!_dynamic) {
                    if (_options.menu.edit !== false && _options.elementKey) {
                        const jsonElement = getJsonDomElements(_options.elementKey)

                        if (jsonElement && (isCms || jsonElement.options || jsonElement.groupOptions)) {

                            editElementEvent = () => {
                                this.handleEditElement({jsonElement, subJson, isCms, json: _json})
                            }
                            menuItems.push({
                                name: _options.menuTitle.edit || 'Komponenten Einstellungen',
                                icon: <SettingsInputComponentIcon/>,
                                onClick: editElementEvent
                            })
                        }
                    }

                    if (_options.menu.editTemplate !== false && Util.hasCapability(_user, CAPABILITY_MANAGE_CMS_TEMPLATE)) {
                        menuItems.push({
                            name: 'Template bearbeiten',
                            icon: <BuildIcon/>,
                            onClick: this.handleTemplateEditClick.bind(this)
                        })
                    }

                    if (_options.menu.clone !== false) {
                        menuItems.push({
                            name: 'Element duplizieren',
                            icon: <FileCopyIcon/>,
                            onClick: this.handleCopyClick.bind(this)
                        })
                    }

                    if (!isInLoop) {


                        if (_options.allowDrop && _options.menu.add !== false) {
                            menuItems.push({
                                name: 'Element hinzufügen',
                                icon: <AddIcon/>,
                                onClick: () => {
                                    JsonDomHelper.disableEvents = true
                                    this.setState({addChildDialog: {selected: false}})
                                }
                            })
                        }

                        if (_options.menu.addAbove !== false) {

                            menuItems.push({
                                name: 'Element oberhalb einfügen',
                                icon: <PlaylistAddIcon/>,
                                onClick: () => {
                                    JsonDomHelper.disableEvents = true
                                    this.setState({addChildDialog: {selected: false, addabove: true}})
                                }
                            })
                        }

                        if (_options.menu.addBelow !== false) {
                            menuItems.push({
                                name: 'Element unterhalb einfügen',
                                icon: <PlaylistAddIcon/>,
                                onClick: () => {
                                    JsonDomHelper.disableEvents = true
                                    this.setState({addChildDialog: {selected: false, addbelow: true}})
                                }
                            })
                        }
                        if (_options.menu.wrap !== false) {
                            menuItems.push({
                                name: 'Element ausserhalb einfügen',
                                icon: <FlipToBackIcon/>,
                                onClick: () => {
                                    JsonDomHelper.disableEvents = true
                                    this.setState({addChildDialog: {selected: false, wrap: true}})
                                }
                            })
                        }
                    }

                    if (_options.menu.remove !== false) {
                        menuItems.push({
                            name: 'Element entfernen',
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
                            name: 'Element in Zwischenablage kopieren',
                            icon: <FileCopyIcon/>,
                            onClick: () => {
                                navigator.clipboard.writeText(JSON.stringify(subJson, null, 2))
                            }
                        })


                        menuItems.push({
                            name: 'Element von Zwischenablage einfügen',
                            icon: <FileCopyIcon/>,
                            onClick: () => {

                                navigator.clipboard.readText().then(text => {
                                    if (text) {
                                        try {
                                            const json = JSON.parse(text),
                                                pos = parseInt(rest._key.substring(rest._key.lastIndexOf('.') + 1)) + 1

                                            this.handleAddChildClick(json, pos)

                                        } catch (e) {

                                        }
                                    }
                                }).catch(err => {
                                    console.log('Something went wrong', err)
                                })

                            }
                        })
                    }
                }
            }

            toolbar = <StyledToolbarButton
                key={rest._key + '.toolbar'}
                data-toolbar={rest._key}
                onMouseOver={this.onToolbarMouseOver.bind(this)}
                onMouseOut={this.onToolbarMouseOut.bind(this)}
                style={{top: this.state.top, left: this.state.left, height: this.state.height}}>

                <StyledInfoBox style={{display: 'none'}}>{subJson ? subJson.t || 'Text' + ' - ' : ''}{rest.id || rest._key}</StyledInfoBox>

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

            if (_options.highlight !== false) {
                const highligherColor = isCms || _options.picker ? 'blue' : 'yellow'
                highlighter = <StyledHighlighter
                    key={rest._key + '.highlighter'}
                    data-highlighter={rest._key}
                    style={{
                        top: this.state.top - 1,
                        left: this.state.left - 1,
                        height: this.state.height + 2,
                        width: this.state.width + 2
                    }}
                    color={highligherColor}>{_options.picker || isCms ?
                    <StyledPicker
                        data-picker={rest._key}
                        onMouseOver={this.onToolbarMouseOver.bind(this)}
                        onMouseOut={this.onToolbarMouseOut.bind(this)}
                        onContextMenu={events.onContextMenu.bind(this)}
                        onClick={(e) => {
                            e.stopPropagation()
                            if (isCms) {
                                this.props.history.push('/' + subJson.p.slug)
                            } else {
                                this.openPicker(_options)
                            }
                        }}>{isCms && subJson && subJson.p ? subJson.p.id || subJson.p.slug :
                        <ImageIcon/>}</StyledPicker> : ''}</StyledHighlighter>
            }
        }

        let kids
        if ((!children || children.constructor !== String) && hasJsonToEdit && !isInLoop && _options.allowDrop && _options.dropArea !== false) {
            kids = []
            if (children && children.length) {

                let index = -1
                for (let i = 0; i < children.length; i++) {
                    if (children[i].key) {
                        index = parseInt(children[i].key.substring(children[i].key.lastIndexOf('.') + 1))

                        if (!_options.excludeDrop || _options.excludeDrop.indexOf(index) < 0) {
                            kids.push(this.getDropArea(this.props, index))
                        }
                    }
                    kids.push(children[i])
                }
                if (index > -1) {
                    kids.push(this.getDropArea(this.props, index + 1))
                }

            } else {
                kids.push(this.getDropArea(this.props, 0))
            }

        } else {
            kids = children
        }

        let comp

        if (isCms) {
            comp = <div _key={rest._key} key={rest._key} {...events}>
                <_WrappedComponent
                    onChange={overrideOnChange || onChange}
                    onClick={overrideOnClick || onClick}
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
                onDoubleClick={editElementEvent}
                onChange={overrideOnChange || onChange}
                onClick={overrideOnClick || onClick}
                _inlineeditor={_inlineEditor ? _inlineEditor.toString() : ''}
                data-isempty={isEmpty}
                key={rest._key}
                {...events}
                {...rest}
                children={kids}/>
        }
        if (toolbar) {
            return [comp, <AddToBody key="hover">{highlighter}{toolbar}</AddToBody>]
        } else {
            const availableJsonElements = getJsonDomElements(null, {advanced: Util.hasCapability(_user, CAPABILITY_MANAGE_CMS_TEMPLATE)})
            return <React.Fragment>{comp}
                {(deleteConfirmDialog &&
                    <AddToBody>
                        <SimpleDialog fullWidth={true} maxWidth="sm" key="deleteConfirmation" open={true}
                                      onClose={(e) => {
                                          if (e.key === 'delete') {
                                              this.handleDeleteClick()
                                          }

                                          this.setState({deleteConfirmDialog: null})

                                          setTimeout(() => {
                                              JsonDomHelper.disableEvents = false
                                          }, 200)
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
                    <AddToBody>
                        <SimpleDialog fullWidth={true} maxWidth="lg" key="addChildDialog" open={true}
                                      onClose={this.onAddChildDialogClose.bind(this)}
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
                                      title={`Bearbeitung ${addChildDialog.selected ? '(' + addChildDialog.selected.name + ')' : ''}`}>

                            {!addChildDialog.edit && <SimpleSelect
                                fullWidth={true}
                                style={{width: 'calc(100% - 16px)'}}
                                label="Element auswählen"
                                value={addChildDialog.selected && addChildDialog.selected.defaults && addChildDialog.selected.defaults.$inlineEditor.elementKey}
                                onChange={(e) => {
                                    const value = e.target.value
                                    let item
                                    for (let i = 0; i < availableJsonElements.length; i++) {
                                        const comp = availableJsonElements[i]
                                        if (value === comp.defaults.$inlineEditor.elementKey) {
                                            // replace __uid__ placeholder
                                            const uid = 'genid_' + Math.random().toString(36).substr(2, 9)
                                            item = JSON.parse(JSON.stringify(comp).replace(/__uid__/g, uid))
                                            break
                                        }
                                    }

                                    if (item.groupOptions) {
                                        Object.keys(item.groupOptions).forEach(key => {
                                            item.options['!' + key + '!add'] = {
                                                uitype: 'button',
                                                group: item.groupOptions[key],
                                                key,
                                                newLine: true,
                                                label: 'Hinzufügen',
                                                tab: 'Slides',
                                                tabPosition: 0,
                                                action: 'add',
                                                style: {marginBottom: '2rem'},
                                                ...item.groupOptions[key]._addButton
                                            }
                                            Object.keys(item.groupOptions[key]).forEach(fieldKey => {
                                                if (fieldKey !== '_addButton') {
                                                    item.options['!' + key + '!' + fieldKey + '!0'] = item.groupOptions[key][fieldKey]
                                                }
                                            })
                                        })
                                    }

                                    this.setState({
                                        addChildDialog: null
                                    }, () => {
                                        this.setState({
                                            addChildDialog: {
                                                ...addChildDialog,
                                                selected: item,
                                                form: null
                                            }
                                        })
                                    })

                                }}
                                items={availableJsonElements}
                            />}

                            {addChildDialog.selected && addChildDialog.selected.options &&
                            <GenericForm primaryButton={false}
                                         onPosChange={({field, newIndex}) => {

                                             const item = addChildDialog.selected,
                                                 curKey = '!' + field.key + '!'
                                             item.options = Object.assign({}, item.options)

                                             Object.keys(field.group).forEach(groupKey => {
                                                 const from = item.options[curKey + groupKey + '!' + field.index],
                                                     to = item.options[curKey + groupKey + '!' + newIndex]
                                                 if (to && from) {
                                                     item.options[curKey + groupKey + '!' + field.index] = to
                                                     item.options[curKey + groupKey + '!' + newIndex] = from
                                                 }
                                             })
                                             this.setState({addChildDialog: {...addChildDialog, selected: item}})

                                         }}
                                         onButtonClick={(field) => {
                                             const item = addChildDialog.selected,
                                                 curKey = '!' + field.key + '!'

                                             item.options = Object.assign({}, item.options)

                                             if (field.action === 'add') {
                                                 let curIdx = 0
                                                 Object.keys(item.options).forEach(optionKey => {
                                                     const formField = addChildDialog.form.state.fields[optionKey]
                                                     if (formField) {
                                                         item.options[optionKey].value = formField
                                                     }

                                                     if (optionKey.startsWith(curKey)) {
                                                         const parts = optionKey.split('!'),
                                                             newIdx = parseInt(parts[parts.length - 1])
                                                         if (newIdx > curIdx) {
                                                             curIdx = newIdx
                                                         }
                                                     }
                                                 })
                                                 Object.keys(field.group).forEach(groupKey => {
                                                     if (groupKey !== '_addButton') {
                                                         const newItem = Object.assign({}, item.groupOptions[field.key][groupKey])
                                                         delete newItem.value
                                                         if (newItem.expandable === false) {
                                                             delete newItem.expandable
                                                         }
                                                         item.options[curKey + groupKey + '!' + (curIdx + 1)] = newItem
                                                     }
                                                 })


                                                 item.options['!' + field.key + '!delete!' + (curIdx + 1)] = {
                                                     uitype: 'button',
                                                     label: 'Löschen',
                                                     action: 'delete',
                                                     key: field.key,
                                                     group: item.groupOptions[field.key],
                                                     index: (curIdx + 1),
                                                     newLine: true,
                                                     expandable: false
                                                 }

                                             } else if (field.action === 'delete') {
                                                 Object.keys(field.group).forEach(groupKey => {
                                                     delete item.options[curKey + groupKey + '!' + field.index]
                                                 })
                                                 delete item.options[curKey + 'delete!' + field.index]

                                             }

                                             this.setState({addChildDialog: {...addChildDialog, selected: item}})
                                         }}
                                         onRef={(e) => {
                                             addChildDialog.form = e
                                         }}
                                         fields={addChildDialog.selected.options}/>}

                        </SimpleDialog></AddToBody>)}</React.Fragment>
        }
    }

    handleEditElement({jsonElement, subJson, isCms, json, jsonDom}) {
        JsonDomHelper.disableEvents = true

        //clone
        const newJsonElement = JSON.parse(JSON.stringify(jsonElement))
        delete newJsonElement.defaults

        newJsonElement.options = deepMerge({}, newJsonElement.options, subJson.$inlineEditor && subJson.$inlineEditor.options)
        newJsonElement.groupOptions = deepMerge({}, newJsonElement.groupOptions, subJson.$inlineEditor && subJson.$inlineEditor.groupOptions)

        Object.keys(newJsonElement.options).forEach(key => {

            if(!newJsonElement.options[key]){
                return
            }
            let val = propertyByPath('$original_' + key, subJson, '_')
            if (!val) {
                val = propertyByPath(key, subJson, '_')
            }

            if (newJsonElement.options[key].tr && newJsonElement.options[key].trKey) {
                if (this.props._scope.data.tr) {
                    const trEl = this.props._scope.data.tr[newJsonElement.options[key].trKey]
                    newJsonElement.options[key].value = trEl ? trEl.replace(/\\"/g, '"') : ''
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
                                optData.expandable += ' ' + (idx + 1) + (groupFieldValue && groupFieldValue.constructor === String ? ' (' + groupFieldValue.substring(0, 20) + ')' : '')
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
            addChildDialog: {selected: newJsonElement, json, subJson, jsonDom, edit: true}
        })
    }

    onAddChildDialogClose(event){
        const {_onTemplateChange, _onDataResolverPropertyChange, _key} = this.props
        const {addChildDialog} = this.state

        const selected = addChildDialog.selected
        const subJson = addChildDialog.subJson
        const json = addChildDialog.json

        if (event.key === 'save' && selected) {

            let comp = {'t': selected.tagName, ...selected.defaults}
            if (addChildDialog.edit) {
                // merge existing component
                comp = deepMergeOptional({
                    mergeArray: true,
                    arrayCutToLast: true
                }, comp, subJson)
            }


            if (addChildDialog.form) {
                const fields = addChildDialog.form.state.fields

                let groupKeyMap = {}
                Object.keys(fields).forEach(key => {
                    let val = fields[key]
                    if (key.startsWith('!')) {
                        // group Options
                        const parts = key.split('!'),
                            groupKey = parts[1], groupProp = parts[2],
                            groupIdx = parseInt(parts[3])

                        if (!isNaN(groupIdx) && selected.groupOptions[groupKey]) {


                            const groupFieldOption = selected.groupOptions[groupKey][groupProp]

                            if (selected.groupOptions[groupKey][groupProp]) {

                                const groupFieldOption = Object.assign({},
                                    selected.groupOptions[groupKey][groupProp],
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
                            selected.options && selected.options[key],
                            comp.$inlineEditor && comp.$inlineEditor.options && comp.$inlineEditor.options[key])

                        if (currentOpt.template && val !== undefined && val !== null) {
                            setPropertyByPath(val, '$original_' + key, comp, '_')
                            val = Util.replacePlaceholders(currentOpt.template, {_comp: comp, ...(val.constructor === String ? {data: val} : val[0])})

                        }

                        if (currentOpt.tr && currentOpt.trKey) {

                            setPropertyByPath(`$\{_t('${currentOpt.trKey}'${currentOpt.trContext?','+currentOpt.trContext:''})\}`, key, comp, '_')
                            if (val !== null) {
                                _onDataResolverPropertyChange({
                                    value: Util.escapeForJson(Util.escapeForJson(val.replace(/\n/g, ''))),
                                    path: 'tr.' + _app_.lang + '.' + currentOpt.trKey,
                                    instantSave: true
                                })
                            }

                        } else {
                            setPropertyByPath(val, key, comp, '_')
                        }
                    }
                })

                Object.keys(groupKeyMap).forEach(groupKey=>{
                    setPropertyByPath(groupKeyMap[groupKey], groupKey, comp, '_')
                })
            }


            if (addChildDialog.edit) {

                Object.keys(comp).forEach((key) => {
                    subJson[key] = comp[key]
                })

                Util.removeNullValues(subJson, {
                    recursiv: true,
                    emptyObject: true,
                    emptyArray: true,
                    nullArrayItems: true
                })

                if (subJson.$inlineEditor && subJson.$inlineEditor.options) {
                    Object.keys(subJson.$inlineEditor.options).forEach(optKey => {
                        delete subJson.$inlineEditor.options[optKey].value
                    })
                }

                if(addChildDialog.jsonDom){
                    addChildDialog.jsonDom.props.onTemplateChange(json, true)
                }else {
                    _onTemplateChange(json, true)
                }

            } else {

                Util.removeNullValues(comp, {
                    recursiv: true,
                    emptyObject: true,
                    emptyArray: true,
                    nullArrayItems: true
                })

                if (addChildDialog.wrap) {
                    const wrapped = Object.assign({}, subJson)

                    Object.keys(subJson).forEach((key) => {
                        delete subJson[key]
                    })


                    Object.keys(comp).forEach((key) => {
                        subJson[key] = comp[key]
                    })
                    subJson.c = [wrapped]

                    _onTemplateChange(json, true)
                } else {

                    // add new
                    let pos
                    // determine position to insert in parent node
                    if (addChildDialog.addbelow) {
                        pos = parseInt(_key.substring(_key.lastIndexOf('.') + 1)) + 1
                    } else if (addChildDialog.addabove) {
                        pos = parseInt(_key.substring(_key.lastIndexOf('.') + 1))
                    }
                    this.handleAddChildClick(comp, pos)
                }
            }
        }
        JsonDomHelper.disableEvents = false
        this.setState({addChildDialog: null})
    }
}


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


export default JsonDomHelper
