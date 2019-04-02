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
    toolbar: {
        zIndex: 9999,
        position: 'fixed',
        background: theme.palette.grey['200'],
        boxShadow: theme.shadows['1'],
        padding: theme.spacing.unit / 2,
        opacity: 0.7,
        fontSize: '0.9rem',
        color: 'black'
    },
    toolbarHovered: {
        opacity: 1
    }
})

const COMPONENT_WITH_WRAPPER = ['Button', 'Cms', 'Divider']


class JsonDomHelper extends React.Component {
    state = {hovered: false, top: 0, left: 0, height: 0, width: 0, toolbarHovered: false}

    constructor(props) {
        super(props)
    }

    shouldComponentUpdate(props, state) {
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

        if ( !this.state.hovered) {
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
        }else{
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

    handleEditClick(e) {
        e.stopPropagation()
        e.preventDefault()
        const {_cmsActions, _key, _item, _scope} = this.props
        _cmsActions.editCmsComponent(_key, _item, _scope)

    }

    render() {
        const {classes, _WrappedComponent, _item, _cmsActions, children, ...rest} = this.props
        const {hovered, toolbarHovered} = this.state
        let toolbar, highlighter
        if (hovered || toolbarHovered) {
            toolbar = <span
                key={rest._key + '.toolbar'}
                onMouseOver={this.onToolbarMouseOver.bind(this)}
                onMouseOut={this.onToolbarMouseOut.bind(this, classes.toolbar)}
                onClick={this.handleEditClick.bind(this)}
                style={{top: this.state.top, left: this.state.left}}
                className={classNames(classes.toolbar, toolbarHovered && classes.toolbarHovered)}><EditIcon
                size="small"/></span>

            highlighter = <span
                key={rest._key + '.highlighter'}
                style={{top: this.state.top, left: this.state.left, height: this.state.height, width: this.state.width}}
                className={classes.highlighter}/>
        }

        const props = {
            onMouseOver: this.onHelperMouseOver.bind(this),
            onMouseOut: this.onHelperMouseOut.bind(this)
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
                } else if (children.constructor === Array) {
                    kids.push(...children)
                    kids.push(toolbar)
                    kids.push(highlighter)

                } else {
                    kids.push(children, toolbar, highlighter)
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
