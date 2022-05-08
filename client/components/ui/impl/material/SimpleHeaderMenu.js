import React from 'react'
import PropTypes from 'prop-types'
import {connect} from 'react-redux'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Button from '@mui/material/Button'
import config from 'gen/config-client'
import Typography from '@mui/material/Typography'

class SimpleHeaderMenu extends React.Component {


    constructor(props) {
        super(props)
        this.currentLinkParts = window.location.pathname.substring(config.ADMIN_BASE_URL.length + 1).split('/')
    }

    UNSAFE_componentWillReceiveProps(nextProps) {
        this.currentLinkParts = window.location.pathname.substring(config.ADMIN_BASE_URL.length + 1).split('/')
    }

    linkTo(item) {
        _app_.history.push(item.to)
    }

    isActive(link) {
        const linkCut = link.substring(config.ADMIN_BASE_URL.length + 1).split('/')
        return linkCut[0] === this.currentLinkParts[0]
    }

    render() {
        const {isAuthenticated, items, title, children, position} = this.props;
        return (
            <AppBar position={position}>
                <Toolbar>
                    <div style={{flex: 1}}>
                        {title &&
                        <Typography variant="h6" color="inherit">
                            {title}
                        </Typography>
                        }
                        {items && items.map((item, i) => {
                            if (item.auth && isAuthenticated || !item.auth) {
                                const isActive = this.isActive(item.to)
                                return <Button variant={isActive ? 'contained' : 'flat'}
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
)(SimpleHeaderMenu)
