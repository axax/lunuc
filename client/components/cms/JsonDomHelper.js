import React from 'react'
import PropTypes from 'prop-types'
import {withStyles} from 'ui/admin'
import classNames from 'classnames'
import * as CmsActions from 'client/actions/CmsAction'
import {bindActionCreators} from 'redux'
import {connect} from 'react-redux'

const styles = theme => ({
    toolbar: {
        position: 'absolute',
        background: theme.palette.grey['200'],
        boxShadow: theme.shadows['1'],
        padding: theme.spacing.unit / 2,
        opacity: 0.7,
        fontSize: '0.9rem'
    },
    toolbarHovered: {
        opacity: 1
    }
})


class JsonDomHelper extends React.Component {
    state = {hovered: false, top: 0, left: 0, toolbarHovered: false}

    constructor(props) {
        super(props)
    }

    onHelperMouseOver(e) {
        e.stopPropagation()
        clearTimeout(this.helperTimeout)
        this.setState({hovered: true, top: e.target.offsetTop, left: e.target.offsetLeft})
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

    onToolbarMouseOut(e) {
        e.stopPropagation()
        setTimeout(() => {
            this.setState({toolbarHovered: false})
        }, 50)
    }

    handleEditClick(e) {
        e.stopPropagation()
        const {_cmsActions, _key, _item} = this.props
        _cmsActions.editCmsComponent(_key, _item)

    }

    render() {
        const {classes, _WrappedComponent, _key, _cmsActions, children, ...rest} = this.props
        let toolbar
        if (this.state.hovered || this.state.toolbarHovered) {
            toolbar = <span
                key={_key + '.toolbar'}
                onMouseOver={this.onToolbarMouseOver.bind(this)}
                onMouseOut={this.onToolbarMouseOut.bind(this)}
                onClick={this.handleEditClick.bind(this)}
                style={{top: this.state.top, left: this.state.left}}
                className={classNames(classes.toolbar, this.state.toolbarHovered && classes.toolbarHovered)}>{_key}</span>
        }

        const props = {
            onMouseOver: this.onHelperMouseOver.bind(this),
            onMouseOut: this.onHelperMouseOut.bind(this)
        }
        if (!children) {
            // need wrapper
            return <span {...props}><_WrappedComponent {...rest}/>
                {toolbar}</span>
        } else if (_WrappedComponent.name && _WrappedComponent.name.endsWith('$')) {
            return <span {...props}><_WrappedComponent {...rest}>{children}</_WrappedComponent>
                {toolbar}</span>

        } else {
            let kids = children

            if (toolbar) {
                kids = []
                if (children.constructor === Array) {
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
    _item: PropTypes.object.isRequired
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
