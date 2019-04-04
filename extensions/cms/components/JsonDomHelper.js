import React from 'react'
import PropTypes from 'prop-types'
import {withStyles} from 'ui/admin'
import * as CmsActions from 'client/actions/CmsAction'
import {bindActionCreators} from 'redux'
import {connect} from 'react-redux'
import {
    EditIcon
} from 'ui/admin'
import classNames from 'classnames'


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

const COMPONENT_WITH_WRAPPER = ['Button', 'Cms', 'Divider']


class JsonDomHelper extends React.Component {
    state = {hovered: false, top: 0, left: 0, height: 0, width: 0, toolbarHovered: false}

    constructor(props) {
        super(props)
    }

    shouldComponentUpdate(props, state) {
        if( this._onDrag ){
            // never update when element is being dragged
            return false
        }
        return props._item !== this.props._item ||
            state.hovered !== this.state.hovered ||
            state.toolbarHovered !== this.state.toolbarHovered
    }

    elemOffset(el) {
        var xPos = 0
        var yPos = 0

        while (el) {
            if (el.tagName == "BODY") {
                // deal with browser quirks with body/window/document and page scroll
                var xScroll = el.scrollLeft || document.documentElement.scrollLeft
                var yScroll = el.scrollTop || document.documentElement.scrollTop

                xPos += (el.offsetLeft - xScroll + el.clientLeft)
                yPos += (el.offsetTop - yScroll + el.clientTop)
            } else {
                // for all other non-BODY elements
                xPos += (el.offsetLeft - el.scrollLeft + el.clientLeft)
                yPos += (el.offsetTop - el.scrollTop + el.clientTop)
            }

            el = el.offsetParent
        }
        return {
            left: xPos,
            top: yPos
        }
    }

    helperTimeoutOut = null
    helperTimeoutIn = null

    onHelperMouseOver(e) {
        e.stopPropagation()
        clearTimeout(this.helperTimeoutOut)
        clearTimeout(this.helperTimeoutIn)

        if (!this.state.hovered) {
            const stat = {
                hovered: true,
                height: e.target.offsetHeight,
                width: e.target.offsetWidth, ...this.elemOffset(e.target)
            }
            this.helperTimeoutIn = setTimeout(() => {
                this.setState(stat)
            }, 50)
        }

    }


    onHelperMouseOut(e) {
        e.stopPropagation()

        if (this.state.hovered) {
            this.helperTimeoutOut = setTimeout(() => {
                this.setState({hovered: false})
            }, 50)
        } else {
            clearTimeout(this.helperTimeoutIn)
        }
    }

    setStyleForClass(style, className) {
        const dropAreas = document.querySelectorAll('.' + className)

        for (const dropArea of dropAreas) {
            dropArea.style = style
        }
    }

    onToolbarMouseOver(e) {
        e.stopPropagation()
        this.setState({toolbarHovered: true})
    }

    onDragStart(e) {
        e.stopPropagation()
        this._onDrag = true

        //e.preventDefault()
        const {classes} = this.props
            // TODO maybe only show drop areas which are close???
            this.setStyleForClass('display:block', classes.dropArea)
        this.setStyleForClass('display:none', classes.toolbar)
        this.setStyleForClass('display:none', classes.highlighter)


        //this.setState({hovered: false, toolbarHovered:false})
        //console.log('start', this.props._key)
        //e.dataTransfer.setData('text/plain', this.props._key)
    }

    onDragEnd(e) {
        e.stopPropagation()
        console.log(e)
        this._onDrag = false
        this.setStyleForClass('display:none', this.props.classes.dropArea)
        this.setState({toolbarHovered: false, hovered: false})
    }

    onDragEnter(e) {
        e.stopPropagation()
        e.currentTarget.classList.add(this.props.classes.dropAreaOver)
    }

    onDragLeave(e) {
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

    render() {
        const {classes, _WrappedComponent, _item, _cmsActions, children, ...rest} = this.props
        const {hovered, toolbarHovered} = this.state
        let toolbar, highlighter, dropAreaAbove, dropAreaBelow

        const props = {
            onMouseOver: this.onHelperMouseOver.bind(this),
            onMouseOut: this.onHelperMouseOut.bind(this)
        }

console.log(this.props._key)
        if (hovered || toolbarHovered) {

            props.draggable = 'true'
            props.onDragStart = this.onDragStart.bind(this)
            props.onDragEnd = this.onDragEnd.bind(this)

            toolbar = <span

                /*draggable="true"
                 onDragStart={this.onDragStart.bind(this)}
                 onDragEnd={this.onDragEnd.bind(this)}*/

                key={rest._key + '.toolbar'}
                onMouseOver={this.onToolbarMouseOver.bind(this)}
                onMouseOut={this.onToolbarMouseOut.bind(this, classes.toolbar)}
                onClick={this.handleEditClick.bind(this)}
                style={{top: this.state.top, left: this.state.left}}
                className={classNames(classes.toolbar, toolbarHovered && classes.toolbarHovered)}><EditIcon
                className={classes.toolbarIcon}
                size="small"/>
                <span className={classes.info}>{_item.t} - {rest._key}</span>

            </span>

            highlighter = <span
                key={rest._key + '.highlighter'}
                style={{top: this.state.top, left: this.state.left, height: this.state.height, width: this.state.width}}
                className={classes.highlighter}/>
        } else {

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

            //props.onDragEnter = this.onDragEnter.bind(this)
            //props.onDragLeave = this.onDragLeave.bind(this)
            // props.onDragStart = this.onDragStart.bind(this)
            // <div id="div1" ondrop="drop(event)" ondragover="allowDrop(event)"></div>

        }

        const componentName = _WrappedComponent.name || ''
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
            } else if (dropAreaAbove) {

                kids = []
                if (!children) {
                    kids.push(dropAreaAbove)
                } else {
                    kids.push(dropAreaAbove)
                    if (children.constructor === Array) {
                        kids.push(...children)
                    } else {
                        kids.push(children)
                    }
                    kids.push(dropAreaBelow)
                }
            }
            return <_WrappedComponent {...props} {...rest}>{kids}</_WrappedComponent>
        }
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
