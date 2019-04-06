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
        margin: '2px',
        border: '1px dashed #c1c1c1',
        height: '10px',
        color: '#c1c1c1',
        textAlign: 'center',
        fontSize: '0.6rem',
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
        return props._item !== this.props._item ||
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
console.log(draggable)
            this._onDragTimeout = setTimeout(() => {

                /*if( !JsonDomHelper.currentDragElement ){
                 return
                 }*/
                const tags = document.querySelectorAll('.' + this.props.classes.dropArea)

                for (const tag of tags) {


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

                    console.log(JsonDomHelper.currentDragElement)

                    const pos = DomUtil.elemOffset(node)

                    const distance = Math.abs(this._clientY - (pos.top + node.offsetHeight / 2))
                    if (distance < 50) {
                        tag.style.display = 'block'
                    } else {

                        tag.style.display = 'none'
                    }
                }


                console.log(this._clientX, this._clientY)
            }, 100)
        }
    }

    onDragEnd(e) {
        e.stopPropagation()

        JsonDomHelper.currentDragElement = null
        this.setState({toolbarHovered: false, hovered: false, dragging: false})
    }

    onDragEnterDropArea(e) {
        e.stopPropagation()
        e.currentTarget.classList.add(this.props.classes.dropAreaOver)
    }

    onDragLeaveDropArea(e) {
        e.stopPropagation()
        e.currentTarget.classList.remove(this.props.classes.dropAreaOver)
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

    handleEditClick(e) {
        e.stopPropagation()
        e.preventDefault()
        const {_cmsActions, _key, _item, _scope} = this.props
        _cmsActions.editCmsComponent(_key, _item, _scope)

    }

    getDropArea(data, key) {
        return <div
            onMouseOver={(e) => {
                e.stopPropagation()
            }}
            onDragEnter={this.onDragEnterDropArea.bind(this)}
            onDragLeave={this.onDragLeaveDropArea.bind(this)}
            key={data._key + '.dropArea' + key}
            style={{paddingLeft: (10 * (data._key.split('.').length - 1))}}
            className={this.props.classes.dropArea}>drop here ${data.id || data._key}</div>
    }

    render() {
        const {classes, _WrappedComponent, _item, _cmsActions, children, ...rest} = this.props
        const {hovered, toolbarHovered, dragging} = this.state
        let toolbar, highlighter, dropAreaAbove, dropAreaBelow

        const events = {
            onMouseOver: this.onHelperMouseOver.bind(this),
            onMouseOut: this.onHelperMouseOut.bind(this),
            draggable: 'true',
            onDragStart: this.onDragStart.bind(this),
            onDragEnd: this.onDragEnd.bind(this),
            onDrag: this.onDrag.bind(this)
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
                <span className={classes.info}>{_item.t} - {rest.id || rest._key}</span>

            </span>

            highlighter = <span
                key={rest._key + '.highlighter'}
                style={{top: this.state.top, left: this.state.left, height: this.state.height, width: this.state.width}}
                className={classes.highlighter}/>
        }

        let kids
        if (children && children.constructor === Array) {
            // hier it is dropable
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

        /*
         dropAreaAbove = <span
         onMouseOver={(e) => {
         e.stopPropagation()
         }}
         onDragEnter={this.onDragEnter.bind(this)}
         onDragLeave={this.onDragLeave.bind(this)}
         key={rest._key + '.dropAreaAbove'}
         className={classNames(classes.dropArea, classes.dropAreaAbove)}>drop below ${rest._key}</span>

         dropAreaBelow = <span
         onMouseOver={(e) => {
         e.stopPropagation()
         }}
         onDragEnter={this.onDragEnter.bind(this)}
         onDragLeave={this.onDragLeave.bind(this)}
         key={rest._key + '.dropAreaBelow'}
         className={classNames(classes.dropArea, classes.dropAreaBelow)}>drop below ${rest._key}</span>
         */
        //props.onDragEnter = this.onDragEnter.bind(this)
        //props.onDragLeave = this.onDragLeave.bind(this)
        // props.onDragStart = this.onDragStart.bind(this)
        // <div id="div1" ondrop="drop(event)" ondragover="allowDrop(event)"></div>


        /*     const componentName = _WrappedComponent.name || ''
         if (!children && componentName !== 'Col') {
         // need wrapper
         return <span
         className={classes.wrapper} {...props}><_WrappedComponent {...rest}/>
         {toolbar}{highlighter}</span>
         } else if (componentName.endsWith('$') || COMPONENT_WITH_WRAPPER.indexOf(componentName) >= 0) {
         return <span
         className={classes.wrapper} {...props}><_WrappedComponent {...rest}>{children}</_WrappedComponent>
         {toolbar}{highlighter}</span>

         } else {
         let kids = children

         if (toolbar) {
         kids = []
         if (!children) {
         kids.push(toolbar)
         } else {
         if (children.constructor === Array) {
         kids.push(...children)
         } else {
         kids.push(children)
         }
         kids.push(toolbar)
         kids.push(highlighter)
         }
         }
         return <_WrappedComponent {...props} {...rest}>{kids}</_WrappedComponent>
         }*/
    }
}


JsonDomHelper.propTypes = {
    classes: PropTypes.object.isRequired,
    _WrappedComponent: PropTypes.any.isRequired,
    _cmsActions: PropTypes.object.isRequired,
    _key: PropTypes.string.isRequired,
    _item: PropTypes.object.isRequired,
    _scope: PropTypes.object.isRequired
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
