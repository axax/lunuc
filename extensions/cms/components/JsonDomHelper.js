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
    DeleteIcon,
    AddIcon,
    BuildIcon,
    ImageIcon
} from 'ui/admin'
import GenericForm from 'client/components/GenericForm'
import classNames from 'classnames'
import AddToBody from './AddToBody'
import DomUtil from 'client/util/dom'
import Util from 'client/util'
import {setPropertyByPath} from '../../../client/util/json'
import {getComponentByKey, addComponent, removeComponent, getParentKey, isTargetAbove} from '../util/jsonDomUtil'
import JsonEditor from './JsonEditor'
import config from 'gen/config'
const {UPLOAD_URL} = config


const styles = theme => ({
    wrapper: {},
    highlighter: {
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
        background: 'rgba(245, 245, 66,0.08)',
    },
    bgBlue: {
        background: 'rgba(84, 66, 245,0.2)',
        color: '#fff',
        fontWeight: 'bold',
        fontSize: '2rem'
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
const ALLOW_DROP_IN = {'Col':['Row'],'li':['ul']}
const ALLOW_DROP_FROM = {'Row':['Col']}
const ALLOW_CHILDREN = ['div', 'main', 'ul', 'Col']

const highlighterHandler = () =>{
    const hightlighter = document.querySelector('[data-highlighter]')
    if (hightlighter && hightlighter.constructor !== NodeList ) {
        const key = hightlighter.getAttribute('data-highlighter')
        const node = document.querySelector('[_key="'+key+'"]')

        if (node && node.constructor !== NodeList ) {
            const offset = DomUtil.elemOffset(node)
            hightlighter.style.top = offset.top+'px'
            hightlighter.style.left = offset.left+'px'
            hightlighter.style.width = node.offsetWidth+'px'
            hightlighter.style.height = node.offsetHeight+'px'


            const toolbar = document.querySelector('[data-toolbar="'+key+'"]')
            if (toolbar && toolbar.constructor !== NodeList ) {
                toolbar.style.top = offset.top+'px'
                toolbar.style.left = offset.left+'px'
                toolbar.style.height = node.offsetHeight+'px'
            }

        }
    }

}

document.addEventListener('keydown', (e)=>{
    if( e.key === 'Alt'){
        JsonDomHelper.altKeyDown=true
    }
})
document.addEventListener('keyup', (e)=>{
    if( e.key === 'Alt'){
        JsonDomHelper.altKeyDown=false
    }
})

document.addEventListener('scroll', highlighterHandler)


class JsonDomHelper extends React.Component {
    static currentDragElement
    static disableEvents = false
    static altKeyDown=false
    static mutationObserver=false

    state = {
        hovered: false,
        top: 0,
        left: 0,
        height: 0,
        width: 0,
        toolbarHovered: false,
        dragging: false,
        toolbarMenuOpen: false,
        addChildDialog: null
    }

    constructor(props) {
        super(props)
    }

    componentDidMount() {
        if(!JsonDomHelper.mutationObserver){
            JsonDomHelper.mutationObserver = new MutationObserver(highlighterHandler)

        }
        JsonDomHelper.mutationObserver.observe(document.querySelector('[data-layout-content]'),  { attributes: false, childList: true, characterData: true, subtree: true })

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
            state.dragging !== this.state.dragging ||
            state.top !== this.state.top ||
            state.height !== this.state.height ||
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
            }, 100)
        }

    }

    onHelperMouseOut(e) {
        if(e) {
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

                const fromTagName=JsonDomHelper.currentDragElement.props._tagName,
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

                    if (JsonDomHelper.currentDragElement) {
                        const tagName = tag.getAttribute('data-tag-name')
                        if( !allowDropIn || allowDropIn.indexOf(tagName)>=0) {

                            const allowDropFrom = ALLOW_DROP_FROM[tagName]
                            if( !allowDropFrom || allowDropFrom.indexOf(fromTagName)>=0) {
                                const pos = DomUtil.elemOffset(node)
                                const distance = Math.abs(this._clientY - (pos.top + node.offsetHeight / 2))
                                if (distance < 50) {
                                    tag.style.display = 'block'
                                } else {
                                    if (distance > 150)
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

        const {classes, _json, _onchange} = this.props
        e.currentTarget.classList.remove(classes.dropAreaOver)

        let sourceKey = JsonDomHelper.currentDragElement.props._key,
            sourceIndex = parseInt(sourceKey.substring(sourceKey.lastIndexOf('.') + 1)),
            sourceParentKey = getParentKey(sourceKey),
            targetKey = e.currentTarget.getAttribute('data-key'),
            targetIndex = parseInt(e.currentTarget.getAttribute('data-index'))


        // 1. get element from json structure by key
        const source = getComponentByKey(sourceKey, _json)


        if (isTargetAbove(sourceKey, targetKey + '.' + targetIndex)) {
            //2. remove it from json
            if (removeComponent(sourceKey, _json)) {

                // 3. add it to new position
                addComponent({key: targetKey, json: _json, index: targetIndex, component: source})

                _onchange(_json)

            }
        } else {
            addComponent({key: targetKey, json: _json, index: targetIndex, component: source})
            removeComponent(sourceKey, _json)
        }
        _onchange(_json)


        this.resetDragState()
    }


    resetDragState() {
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


    handleEditDataClick(e) {
        e.stopPropagation()
        e.preventDefault()
        const {_cmsActions, _edit} = this.props

        _cmsActions.editCmsData(_edit)

    }


    handleAddChildClick(component, index) {
        const {_key, _json, _onchange} = this.props

        let newkey = _key
        if (index !== undefined) {
            newkey = newkey.substring(0, newkey.lastIndexOf('.'))
            if (newkey.indexOf('.') < 0) {
                console.warn('can not add below', _key)
                return
            }
        }else{
            index = 0
        }
        addComponent({key: newkey, json: _json, index, component})
        _onchange(_json)
    }

    handleDeleteClick(e) {
        e.stopPropagation()
        e.preventDefault()
        const {_cmsActions, _key, _json, _scope, _onchange} = this.props

        removeComponent(_key, _json)
        _onchange(_json)
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
            style={{paddingLeft: (10 * (rest._key.split('.').length - 1))}}
            className={this.props.classes.dropArea}>drop here ${rest.id || rest._key}</div>
    }

    openPicker(picker){
        const {_onchange, _key, _json} = this.props

        const w = screen.width / 3 * 2, h = screen.height / 3 * 2,
            left = (screen.width / 2) - (w / 2), top = (screen.height / 2) - (h / 2)

        const newwindow = window.open(
            `/admin/types/?noLayout=true&fixType=${picker.type}&baseFilter=${encodeURIComponent(picker.baseFilter || '')}`, '_blank',
            'toolbar=no, location=no, directories=no, status=no, menubar=no, scrollbars=no, resizable=yes, copyhistory=no, width=' + w + ', height=' + h + ', top=' + top + ', left=' + left)

        newwindow.onbeforeunload = () => {
            if (newwindow.resultValue) {
                //_cmsActions.editCmsComponent(rest._key, _json, _scope)
                const source = getComponentByKey(_key, _json)
                if (source) {
                    if(picker.template){
                        source.$c = Util.replacePlaceholders(picker.template.replace(/\\\{/g,'{'),newwindow.resultValue)
                    }else {
                        if (!source.p) {
                            source.p = {}
                        }
                        source.p.src = UPLOAD_URL + '/' + newwindow.resultValue._id
                    }
                    _onchange(_json)
                }
            }

        }
    }

    render() {
        const {classes, _WrappedComponent, _json, _cmsActions, _onchange, children, _edit, _tagName, _inlineEditor, ...rest} = this.props
        const {hovered, toolbarHovered, toolbarMenuOpen, addChildDialog} = this.state
        const events = {
            onMouseOver: this.onHelperMouseOver.bind(this),
            onMouseOut: this.onHelperMouseOut.bind(this),
            /*onContextMenu: (e)=>{
                e.preventDefault()
                this.setState({
                    mouseX: e.clientX - 2,
                    mouseY: e.clientY - 4
                })
            }*/
        }
        let isTempalteEdit = !!_json, subJson, toolbar, highlighter, dropAreaAbove, dropAreaBelow


        const isLoop = rest._key.indexOf('$loop') >= 0
        const isCms = _WrappedComponent.name === 'Cms'


        if (_inlineEditor.allowDrop === undefined) {
            _inlineEditor.allowDrop = children && children.constructor === Array && ALLOW_DROP.indexOf(_tagName) >= 0
        }

        if (isTempalteEdit) {
            subJson = getComponentByKey(rest._key, _json)

            if (!subJson) {
                isTempalteEdit = false
            }
        }

        if (!isLoop && isTempalteEdit) {
            events.draggable = 'true'
            events.onDragStart = this.onDragStart.bind(this)
            events.onDragEnd = this.onDragEnd.bind(this)
            events.onDrag = this.onDrag.bind(this)
            events.onDrop = this.onDrop.bind(this)
        }


        if (!JsonDomHelper.disableEvents && (hovered || toolbarHovered || toolbarMenuOpen)) {
            const menuItems = []

            if (isCms) {
                menuItems.push({
                    name: 'Open component', icon: <EditIcon/>, onClick: () => {
                        window.location = '/' + subJson.p.slug
                    }
                })
            }

            if (isTempalteEdit) {

                menuItems.push({name: 'Edit template', icon: <BuildIcon/>, onClick: this.handleEditClick.bind(this)},
                    {
                        name: `Remove ${isLoop ? 'Loop' : 'Component'}`,
                        icon: <DeleteIcon/>,
                        onClick: this.handleDeleteClick.bind(this)
                    })

                if (!isLoop && ALLOW_CHILDREN.indexOf(_tagName) >= 0) {
                    menuItems.splice(1, 0, {
                        name: 'Add child component',
                        icon: <AddIcon/>,
                        onClick: () => {
                            JsonDomHelper.disableEvents = true
                            this.setState({addChildDialog: {selected: {value: ''}}})
                        }
                    })
                }

                menuItems.splice(1, 0, {
                    name: 'Add child below',
                    icon: <AddIcon/>,
                    onClick: () => {
                        JsonDomHelper.disableEvents = true
                        this.setState({addChildDialog: {selected: {value: ''}, addbelow: true}})
                    }
                })
            }

            if (_edit) {
                menuItems.splice(0, 0, {
                    name: 'Edit data',
                    icon: <EditIcon/>,
                    onClick: this.handleEditDataClick.bind(this)
                })
            }

            toolbar = <div
                key={rest._key + '.toolbar'}
                data-toolbar={rest._key}
                onMouseOver={this.onToolbarMouseOver.bind(this)}
                onMouseOut={this.onToolbarMouseOut.bind(this, classes.toolbar)}
                style={{top: this.state.top, left: this.state.left, height: this.state.height}}
                className={classNames(classes.toolbar, toolbarHovered && classes.toolbarHovered)}>
                <div
                    className={classes.info}>{_edit ? _edit.type + ': ' : ''}{subJson ? subJson.t || 'Text' + ' - ' : ''}{rest.id || rest._key}</div>
                <SimpleMenu
                    anchorReference={this.state.mouseY?"anchorPosition":"anchorEl"}
                    anchorPosition={
                        this.state.mouseY&& this.state.mouseX
                            ? { top: this.state.mouseY, left: this.state.mouseX }
                            : undefined
                    }
                    onOpen={() => {
                        this.setState({toolbarMenuOpen: true})
                    }}
                    onClose={() => {
                        this.setState({hovered: false, toolbarHovered: false, toolbarMenuOpen: false,mouseY:undefined,mouseX:undefined})
                    }}
                    className={classes.toolbarMenu} mini items={menuItems}/>
            </div>

            highlighter = <span
                key={rest._key + '.highlighter'}
                data-highlighter={rest._key}
                style={{top: this.state.top, left: this.state.left, height: this.state.height, width: this.state.width}}
                className={classNames(classes.highlighter, isCms || _inlineEditor.picker ? classes.bgBlue : classes.bgYellow)}>{_inlineEditor.picker || isCms ?
                <div
                    onMouseOver={this.onToolbarMouseOver.bind(this)}
                    onMouseOut={this.onToolbarMouseOut.bind(this, classes.picker)}
                    onClick={(e) => {
                        e.stopPropagation()
                        if (isCms) {
                            window.location = '/' + subJson.p.slug
                        } else {
                            this.openPicker(_inlineEditor.picker)
                        }
                    }}
                    className={classes.picker}>{isCms && subJson.p ?subJson.p.slug:<ImageIcon />}</div> : ''}</span>
        }

        if (_inlineEditor.picker) {
            events.onClick = () => {

            }
            events.className = classNames(rest.className, classes.picker)
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
            comp = <div key={rest._key} {...events}>
                <_WrappedComponent {...rest} children={kids}/>
            </div>
        } else {
            comp = <_WrappedComponent _inlineeditor="true" key={rest._key} {...events} {...rest} children={kids}/>
        }
        if (toolbar) {
            return [comp, <AddToBody key="hover">{highlighter}{toolbar}</AddToBody>]
        } else {
            return <React.Fragment>{comp}{(addChildDialog &&
            <AddToBody><SimpleDialog fullWidth={true} maxWidth="sm" key="addChildDialog" open={true}
                                     onClose={(e) => {
                                         const selected = addChildDialog.selected
                                         if (e.key === 'save' && selected) {

                                             const compStr = JSON.stringify({'t': selected.value, ...selected.defaults}),
                                                 uid = Math.random().toString(36).substr(2, 9),
                                                 comp = JSON.parse(compStr.replace(/__uid__/g, uid))
                                             let pos

                                             if(addChildDialog.form){
                                                 const fields = addChildDialog.form.state.fields
                                                 Object.keys(fields).forEach(key=>{
                                                     setPropertyByPath(fields[key],key,comp,'_')
                                                 })
                                             }

                                             if( addChildDialog.addbelow) {
                                                 // determine position to insert in parent node
                                                 pos = parseInt(rest._key.substring(rest._key.lastIndexOf('.') + 1)) + 1
                                             }
                                           this.handleAddChildClick(comp, pos)
                                         }
                                         JsonDomHelper.disableEvents = false
                                         this.setState({addChildDialog: null})
                                     }}
                                     actions={[{
                                         key: 'save',
                                         label: 'Save',
                                         type: 'primary'
                                     }]}
                                     title="Edit Value">

                <SimpleSelect
                    fullWidth={true}
                    label="Select a component"
                    value={addChildDialog.selected.value}
                    onChange={(e) => {
                        const value = e.target.value
                        let item
                        for (let i = 0; i < JsonEditor.components.length; i++) {
                            const comp = JsonEditor.components[i]
                            if (value === comp.value) {
                                item = comp
                                break
                            }
                        }
                        this.setState({addChildDialog: {...addChildDialog, selected: item, form: null}})
                    }}
                    items={JsonEditor.components}
                />

                { addChildDialog.selected && addChildDialog.selected.options && <GenericForm primaryButton={false} ref={(e) => {
                    addChildDialog.form = e
                }} fields={addChildDialog.selected.options}/>}

            </SimpleDialog></AddToBody>)}</React.Fragment>
        }
    }
}


JsonDomHelper.propTypes = {
    classes: PropTypes.object.isRequired,
    _WrappedComponent: PropTypes.any.isRequired,
    _cmsActions: PropTypes.object.isRequired,
    _key: PropTypes.string.isRequired,
    _scope: PropTypes.object.isRequired,
    _json: PropTypes.any,
    _edit: PropTypes.object,
    _onchange: PropTypes.func
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
export default connect(
    mapStateToProps,
    mapDispatchToProps
)(withStyles(styles)(JsonDomHelper))
