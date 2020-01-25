import React from 'react'
import ReactDOM from 'react-dom'
import PropTypes from 'prop-types'
import {withStyles} from 'ui/admin'
import * as CmsActions from '../actions/CmsAction'
import {bindActionCreators} from 'redux'
import {connect} from 'react-redux'
import {
    SimpleMenu,
    EditIcon,
    DeleteIcon,
    AddIcon
} from 'ui/admin'
import classNames from 'classnames'
import AddToBody from './AddToBody'
import DomUtil from 'client/util/dom'
import {getComponentByKey, addComponent, removeComponent, getParentKey, isTargetAbove} from '../util/jsonDomUtil'

const styles = theme => ({
    wrapper: {},
    highlighter: {
        position: 'fixed',
        bottom: 0,
        left: 0,
        opacity: 0.1,
        minWidth: '10px',
        minHeight: '10px',
        display: 'block',
        background: 'yellow',
        border: '1px dashed #000',
        pointerEvents: 'none'
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

const ALLOW_DROP = ['div']
const ALLOW_CHILDREN = ['div', 'ul']

class JsonDomHelper extends React.Component {
    static currentDragElement

    state = {
        hovered: false,
        top: 0,
        left: 0,
        height: 0,
        width: 0,
        toolbarHovered: false,
        dragging: false,
        toolbarMenuOpen: false
    }

    constructor(props) {
        super(props)
    }

    componentDidMount() {
        this.scrollHandler = () => {
            const {hovered, toolbarHovered, toolbarMenuOpen} = this.state
            if (hovered || toolbarHovered || toolbarMenuOpen) {
                const node = ReactDOM.findDOMNode(this)
                this.setState({
                    height: node.offsetHeight,
                    width: node.offsetWidth,
                    ...DomUtil.elemOffset(node)
                })
            }
        }

        document.addEventListener('scroll', this.scrollHandler)
    }

    componentWillUnmount() {
        document.removeEventListener('scroll', this.scrollHandler)
    }


    shouldComponentUpdate(props, state) {
        if (JsonDomHelper.currentDragElement && JsonDomHelper.currentDragElement != this) {
            return false
        }
        return props.dangerouslySetInnerHTML !== this.props.dangerouslySetInnerHTML ||
            props._json !== this.props._json ||
            props.children !== this.props.children ||
            state.hovered !== this.state.hovered ||
            state.dragging !== this.state.dragging ||
            state.top !== this.state.top ||
            state.toolbarHovered !== this.state.toolbarHovered
    }

    helperTimeoutOut = null
    helperTimeoutIn = null

    onHelperMouseOver(e) {
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
            }, 50)
        }

    }


    onHelperMouseOut(e) {
        e.stopPropagation()
        const {hovered, dragging} = this.state

        if (dragging) {
            return
        }

        if (hovered) {
            this.helperTimeoutOut = setTimeout(() => {
                this.setState({hovered: false})
            }, 50)
        } else {
            clearTimeout(this.helperTimeoutIn)
        }
    }


    onToolbarMouseOver(e) {
        e.stopPropagation()

        if (!this.state.toolbarMenuOpen) {
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
            }, 50)
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


    handleAddChildClick(e) {
        e.stopPropagation()
        e.preventDefault()
        const {_cmsActions, _key, _json, _scope, _onchange} = this.props

        addComponent({key: _key, json: _json, index: 0})
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
            key={`${rest._key}.dropArea.${index}`}
            style={{paddingLeft: (10 * (rest._key.split('.').length - 1))}}
            className={this.props.classes.dropArea}>drop here ${rest.id || rest._key}</div>
    }

    render() {
        const {classes, _WrappedComponent, _json, _cmsActions, _onchange, children, _edit, ...rest} = this.props
        const {hovered, toolbarHovered, toolbarMenuOpen} = this.state

        const events = {
            onMouseOver: this.onHelperMouseOver.bind(this),
            onMouseOut: this.onHelperMouseOut.bind(this)
        }

        let isTempalteEdit = !!_json, subJson, toolbar, highlighter, dropAreaAbove, dropAreaBelow

        if (isTempalteEdit) {
            subJson = getComponentByKey(rest._key, _json)

            if (!subJson) {
                isTempalteEdit = false
            }
        }

        if (isTempalteEdit) {
            events.draggable = 'true'
            events.onDragStart = this.onDragStart.bind(this)
            events.onDragEnd = this.onDragEnd.bind(this)
            events.onDrag = this.onDrag.bind(this)
            events.onDrop = this.onDrop.bind(this)
        }

        if (hovered || toolbarHovered || toolbarMenuOpen) {
            const menuItems = []

            if (isTempalteEdit) {
                const isLoop = rest._key.indexOf('$loop') >= 0

                menuItems.push({name: 'Edit template', icon: <EditIcon/>, onClick: this.handleEditClick.bind(this)},
                    {
                        name: `Remove ${isLoop ? 'Loop' : 'Component'}`,
                        icon: <DeleteIcon/>,
                        onClick: this.handleDeleteClick.bind(this)
                    })

                if (!isLoop && ALLOW_CHILDREN.indexOf(subJson.t) >= 0) {
                    menuItems.splice(1, 0, {
                        name: 'Add child component',
                        icon: <AddIcon/>,
                        onClick: this.handleAddChildClick.bind(this)
                    })
                }
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
                onMouseOver={this.onToolbarMouseOver.bind(this)}
                onMouseOut={this.onToolbarMouseOut.bind(this, classes.toolbar)}
                style={{top: this.state.top, left: this.state.left, height: this.state.height}}
                className={classNames(classes.toolbar, toolbarHovered && classes.toolbarHovered)}>
                <div className={classes.info}>{_edit ? _edit.type + ': ' : ''}{subJson?subJson.t+' - ':''}{rest.id || rest._key}</div>
                <SimpleMenu
                    onOpen={() => {
                        this.setState({toolbarMenuOpen: true})
                    }}
                    onClose={() => {
                        this.setState({hovered: false, toolbarHovered: false, toolbarMenuOpen: false})
                    }}
                    className={classes.toolbarMenu} mini items={menuItems}/>
            </div>

            highlighter = <span
                key={rest._key + '.highlighter'}
                style={{top: this.state.top, left: this.state.left, height: this.state.height, width: this.state.width}}
                className={classes.highlighter}/>
        }
        let kids
        if (isTempalteEdit && children && children.constructor === Array && ALLOW_DROP.indexOf(subJson.t) >= 0) {
            kids = []
            for (let i = 0; i < children.length; i++) {
                kids.push(this.getDropArea(rest, i))
                kids.push(children[i])
            }
            kids.push(this.getDropArea(rest, children.length))

        } else {
            kids = children
        }
        let comp
        if (_WrappedComponent.name === 'Cms') {
            comp = <div key={rest._key} {...events}>
                <_WrappedComponent {...rest} children={kids}/>
            </div>
        } else {
            comp = <_WrappedComponent key={rest._key} {...events} {...rest} children={kids}/>
        }

        if (toolbar) {
            return [comp, <AddToBody key="hover">{highlighter}{toolbar}</AddToBody>]
        } else {
            return comp
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
