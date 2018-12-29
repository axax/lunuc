import React from 'react'
import PropTypes from 'prop-types'
import {withStyles} from 'ui/admin'
import classNames from 'classnames'
import * as CmsActions from 'client/actions/CmsAction'
import {bindActionCreators} from 'redux'
import {connect} from 'react-redux'
import {
    EditIcon
} from 'ui/admin'


const styles = theme => ({
    wrapper: {},
    toolbar: {
        zIndex: 9999,
        position: 'absolute',
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

const COMPONENT_WITH_WRAPPER = ['Button', 'Cms']


class JsonDomHelper extends React.Component {
    state = {hovered: false, top: 0, left: 0, toolbarHovered: false}

    constructor(props) {
        super(props)
    }

    shouldComponentUpdate(props, state) {
        return props._item !== this.props._item ||
            state.hovered !== this.state.hovered ||
            state.toolbarHovered !== this.state.toolbarHovered
    }

    elemOffset(elem) {
        if (!elem) elem = this;

        var x = elem.offsetLeft;
        var y = elem.offsetTop;

        while (elem = elem.offsetParent) {
            x += elem.offsetLeft;
            y += elem.offsetTop;
        }

        return {left: x, top: y};
    }

    onHelperMouseOver(e) {
        e.stopPropagation()
        clearTimeout(this.helperTimeout)
        this.setState({hovered: true, ...this.elemOffset(e.target)})
    }

    helperTimeout = null

    onHelperMouseOut(e) {
        e.stopPropagation()
        this.helperTimeout = setTimeout(() => {
            this.setState({hovered: false})
        }, 50)
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
        const {classes, _WrappedComponent, _key, _item, _cmsActions, children, ...rest} = this.props
        let toolbar
        if (this.state.hovered || this.state.toolbarHovered) {
            toolbar = <span
                key={_key + '.toolbar'}
                onMouseOver={this.onToolbarMouseOver.bind(this)}
                onMouseOut={this.onToolbarMouseOut.bind(this, classes.toolbar)}
                onClick={this.handleEditClick.bind(this)}
                style={{top: this.state.top, left: this.state.left}}
                className={classNames(classes.toolbar, this.state.toolbarHovered && classes.toolbarHovered)}><EditIcon
                size="small"/></span>
        }

        const props = {
            onMouseOver: this.onHelperMouseOver.bind(this),
            onMouseOut: this.onHelperMouseOut.bind(this)
        }

        const componentName = _WrappedComponent.name || ''
        if (!children && componentName !== 'Col') {
            // need wrapper
            return <span className={classes.wrapper} {...props}><_WrappedComponent {...rest}/>
                {toolbar}</span>
        } else if (componentName.endsWith('$') || COMPONENT_WITH_WRAPPER.indexOf(componentName) >= 0) {
            return <span className={classes.wrapper} {...props}><_WrappedComponent {...rest}>{children}</_WrappedComponent>
                {toolbar}</span>

        } else {
            let kids = children

            if (toolbar) {
                kids = []
                if (!children) {
                    kids.push(toolbar)
                } else if (children.constructor === Array) {
                    kids.push(...children)
                    kids.push(toolbar)

                } else {
                    kids.push(children, toolbar)
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
