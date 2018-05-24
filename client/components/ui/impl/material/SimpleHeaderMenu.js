import React from 'react'
import PropTypes from 'prop-types'
import {connect} from 'react-redux'
import {withRouter} from 'react-router-dom'
import {withStyles} from '@material-ui/core/styles'
import AppBar from '@material-ui/core/AppBar'
import Toolbar from '@material-ui/core/Toolbar'
import Button from '@material-ui/core/Button'
import config from 'gen/config'
import Typography from '@material-ui/core/Typography'

const styles = theme => ({
    toolbarLeft: {
        flex: 1
    }
})

class SimpleHeaderMenu extends React.Component {


    constructor(props) {
        super(props)
        this.currentLinkParts = this.props.location.pathname.substring(config.ADMIN_BASE_URL.length + 1).split('/')
    }

    componentWillReceiveProps(nextProps) {
        this.currentLinkParts = nextProps.location.pathname.substring(config.ADMIN_BASE_URL.length + 1).split('/')
    }

    linkTo(item) {
        this.props.history.push(item.to);
    }

    isActive(link) {
        const linkCut = link.substring(config.ADMIN_BASE_URL.length + 1).split('/')
        return linkCut[0] === this.currentLinkParts[0]
    }

    render() {
        const {classes, isAuthenticated, items, title, children, position} = this.props;
        return (
            <AppBar position={position}>
                <Toolbar>
                    <div className={classes.toolbarLeft}>
                        {title &&
                        <Typography variant="title" color="inherit">
                            {title}
                        </Typography>
                        }
                        {items && items.map((item, i) => {
                            if (item.auth && isAuthenticated || !item.auth) {
                                const isActive = this.isActive(item.to)
                                return <Button variant={isActive ? 'raised' : 'flat'}
                                               color={(isActive ? 'default' : 'inherit')}
                                               onClick={this.linkTo.bind(this, item)} key={i}>{item.name}</Button>
                            }
                        })}
                    </div>
                    {children}
                </Toolbar>
            </AppBar>
        )
    }
}


SimpleHeaderMenu.propTypes = {
    title: PropTypes.string,
    position: PropTypes.string,
    items: PropTypes.array,
    isAuthenticated: PropTypes.bool,
    classes: PropTypes.object.isRequired
}


/**
 * Map the state to props.
 */
const mapStateToProps = (store) => {
    const {user} = store
    return {
        isAuthenticated: user.isAuthenticated
    }
}


/**
 * Connect the component to
 * the Redux store.
 */
export default connect(
    mapStateToProps
)(withRouter(withStyles(styles, {withTheme: true})(SimpleHeaderMenu)))