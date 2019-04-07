import React from 'react'
import ReactDOM from 'react-dom'
import PropTypes from 'prop-types'
import {withStyles} from 'ui/admin'
import * as CmsActions from 'client/actions/CmsAction'
import {bindActionCreators} from 'redux'
import {connect} from 'react-redux'
import {
    EditIcon
} from 'ui/admin'
import classNames from 'classnames'
import AddToBody from './AddToBody'
import DomUtil from 'client/util/dom'
import {getComponentByKey, addComponent, removeComponent, getParentKey} from '../util/jsonDomUtil'

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
        zIndex: 9999,
        position: 'fixed',
        background: theme.palette.grey['200'],
        boxShadow: theme.shadows['1'],
        padding: theme.spacing.unit / 2,
        opacity: 0.7,
        color: 'black',
        fontSize: '0.8rem',
        fontWeight: 'normal',
    },
    toolbarHovered: {
        opacity: 1
    },
    toolbarIcon: {
        width: '0.6rem',
        height: '0.6rem'
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

    state = {hovered: false, top: 0, left: 0, height: 0, width: 0, toolbarHovered: false, dragging: false}

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

        if (dragging) {
            return
        }
        clearTimeout(this.helperTimeoutOut)
        clearTimeout(this.helperTimeoutIn)

        if (!hovered) {
            const stat = {
                hovered: true,
                height: e.target.offsetHeight,
                width: e.target.offsetWidth, ...DomUtil.elemOffset(e.target)
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
        this.setState({toolbarHovered: true})
    }

    onToolbarMouseOut(className, e) {
        let el = e.toElement || e.relatedTarget
        while (el && el.parentNode && el.parentNode != window) {
            if (el.classList.contains(className)) {
                e.preventDefault()
                e.stopPropagation()
                return false
            }
            el = el.parentNode
        }

        e.stopPropagation()
        setTimeout(() => {
            this.setState({toolbarHovered: false})
        }, 50)
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

        //2. remove it from json
        if (removeComponent(sourceKey, _json)) {

            if (sourceParentKey === targetKey) {
                if (sourceIndex <= targetKey) {
                    targetIndex -= 1
                }
            }

            // 3. add it to new position
            addComponent({key: targetKey, json: _json, index: targetIndex, component: source})

            _onchange(_json)

        }

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
            className={this.props.classes.dropArea}>drop here ${rest.id || data_key}</div>
    }

    render() {
        const {classes, _WrappedComponent, _json, _cmsActions, _onchange, children, ...rest} = this.props

        const subJson = getComponentByKey(rest._key, _json)


        const {hovered, toolbarHovered} = this.state
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

        if (hovered || toolbarHovered) {


            toolbar = <span
                key={rest._key + '.toolbar'}
                onMouseOver={this.onToolbarMouseOver.bind(this)}
                onMouseOut={this.onToolbarMouseOut.bind(this, classes.toolbar)}
                onClick={this.handleEditClick.bind(this)}
                style={{top: this.state.top, left: this.state.left}}
                className={classNames(classes.toolbar, toolbarHovered && classes.toolbarHovered)}><EditIcon
                className={classes.toolbarIcon}
                size="small"/>
                <span className={classes.info}>{subJson.t} - {rest.id || rest._key}</span>

            </span>

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

        let comp = <_WrappedComponent key={rest._key} {...events} {...rest} children={kids}/>


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
export default withStyles(styles)(connect(
    mapStateToProps,
    mapDispatchToProps
)(JsonDomHelper))
