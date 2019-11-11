import React from 'react'
import ReactDOM from 'react-dom'
import PropTypes from 'prop-types'
import {withStyles} from 'ui/admin'
import * as CmsActions from '../actions/CmsAction'
import {bindActionCreators} from 'redux'
import {connect} from 'react-redux'
import {
    SimpleMenu,
    EditIcon
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
        opacity: 0.5,
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

    shouldComponentUpdate(props, state) {
        if (JsonDomHelper.currentDragElement && JsonDomHelper.currentDragElement != this) {
            return false
        }
        return props._json !== this.props._json ||
            state.hovered !== this.state.hovered ||
            state.dragging !== this.state.dragging ||
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

        if( !this.state.toolbarMenuOpen ) {
            this.setState({toolbarHovered: true})
        }
    }

    onToolbarMouseOut(className, e) {
        e.stopPropagation()

        if( !this.state.toolbarMenuOpen ) {
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


    handleAddChildClick(e) {
        e.stopPropagation()
        e.preventDefault()
        const {_cmsActions, _key, _json, _scope, _onchange} = this.props

        addComponent({key: _key, json: _json, index: 0})
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
        const {classes, _WrappedComponent, _json, _cmsActions, _onchange, children, ...rest} = this.props

        const subJson = getComponentByKey(rest._key, _json)
        if (!subJson) return null

        const {hovered, toolbarHovered, toolbarMenuOpen} = this.state
        let toolbar, highlighter, dropAreaAbove, dropAreaBelow

        const events = {
            onMouseOver: this.onHelperMouseOver.bind(this),
            onMouseOut: this.onHelperMouseOut.bind(this),
            draggable: 'true',
            onDragStart: this.onDragStart.bind(this),
            onDragEnd: this.onDragEnd.bind(this),
            onDrag: this.onDrag.bind(this),
            onDrop: this.onDrop.bind(this)
        }

        if (hovered || toolbarHovered || toolbarMenuOpen) {


            toolbar = <div
                key={rest._key + '.toolbar'}
                onMouseOver={this.onToolbarMouseOver.bind(this)}
                onMouseOut={this.onToolbarMouseOut.bind(this, classes.toolbar)}
                style={{top: this.state.top, left: this.state.left, height: this.state.height}}
                className={classNames(classes.toolbar, toolbarHovered && classes.toolbarHovered)}>
                <div className={classes.info}>{subJson.t} - {rest.id || rest._key}</div>
                <SimpleMenu
                    onOpen={() => {
                        this.setState({toolbarMenuOpen: true})
                    }}
                    onClose={() => {
                        this.setState({hovered: false, toolbarHovered: false, toolbarMenuOpen: false})
                    }}
                    className={classes.toolbarMenu} mini items={[
                    {name: 'Edit', icon: <EditIcon/>, onClick: this.handleEditClick.bind(this)},
                    {name: 'Add child component', icon: <EditIcon/>, onClick: this.handleAddChildClick.bind(this)}
                    ]}/>
            </div>

            highlighter = <span
                key={rest._key + '.highlighter'}
                style={{top: this.state.top, left: this.state.left, height: this.state.height, width: this.state.width}}
                className={classes.highlighter}/>
        }

        let kids
        if (children && children.constructor === Array) {
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

        if(_WrappedComponent.name === 'Cms'){
            comp = <div {...events}><_WrappedComponent key={rest._key} {...rest} children={kids}/></div>
        }else{
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
    _json: PropTypes.any.isRequired,
    _scope: PropTypes.object.isRequired,
    _onchange: PropTypes.func.isRequired
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
