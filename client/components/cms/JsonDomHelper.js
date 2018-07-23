import React from 'react'
import PropTypes from 'prop-types'
import {withStyles} from 'ui/admin'


const styles = theme => ({
    toolbar: {
        position: 'absolute',
        background: '#f00'
    },
})


class JsonDomHelper extends React.Component {
    state = {hovered: false, top: 0, left: 0, toolbarHovered: false}

    constructor(props) {
        super(props)
    }

    onHelperMouseOver(e) {
        e.stopPropagation()
        console.log('onHelperMouseOver')
        this.setState({hovered: true, top: e.target.offsetTop, left: e.target.offsetLeft})
    }

    onHelperMouseOut(e) {
        e.stopPropagation()
        setTimeout(() => {
            this.setState({hovered: false})
        }, 50)
    }

    onToolbarMouseOver(e) {
        e.stopPropagation()
        console.log('onToolbarMouseOver')
        this.setState({toolbarHovered: true})
    }

    onToolbarMouseOut(e) {
        e.stopPropagation()
        setTimeout(() => {
            this.setState({toolbarHovered: false})
        }, 50)
    }

    render() {
        const {classes, WrappedComponent, children, ...rest} = this.props
        let toolbar
        if (this.state.hovered || this.state.toolbarHovered) {
            toolbar = <span
                key={rest.id + '.toolbar'}
                onMouseOver={this.onToolbarMouseOver.bind(this)}
                onMouseOut={this.onToolbarMouseOut.bind(this)}
                style={{top: this.state.top, left: this.state.left}} className={classes.toolbar}>{rest.id}</span>
        }

        const props = {
            onMouseOver: this.onHelperMouseOver.bind(this),
            onMouseOut: this.onHelperMouseOut.bind(this)
        }
        if (!children) {
            // need wrapper
            return <span {...props}><WrappedComponent {...rest}/>{toolbar}</span>
        } else if (WrappedComponent.name && WrappedComponent.name.endsWith('$')) {
            return <span {...props}><WrappedComponent {...rest}>{children}</WrappedComponent>{toolbar}</span>

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
            return <WrappedComponent {...props} {...rest}>{kids}</WrappedComponent>
        }
    }
}


JsonDomHelper.propTypes = {
    classes: PropTypes.object.isRequired,
    WrappedComponent: PropTypes.any.isRequired
}

export default withStyles(styles)(JsonDomHelper)
