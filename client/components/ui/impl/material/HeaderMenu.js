import React from 'react'
import PropTypes from 'prop-types'
import {connect} from 'react-redux'
import {withRouter} from 'react-router-dom'
import { withStyles } from 'material-ui/styles'
import AppBar from 'material-ui/AppBar'
import Toolbar from 'material-ui/Toolbar'
import Button from 'material-ui/Button'
import {ADMIN_BASE_URL} from 'gen/config'

const styles = theme => ({
    toolbarLeft: {
        flex:1
    }
})

class HeaderMenu extends React.Component {


    constructor(props) {
        super(props)
        this.currentLinkParts = this.props.location.pathname.substring(ADMIN_BASE_URL.length+1).split('/')
    }
    componentWillReceiveProps(nextProps) {
        this.currentLinkParts = nextProps.location.pathname.substring(ADMIN_BASE_URL.length+1).split('/')
    }

    linkTo(item) {
        this.props.history.push(item.to);
    }

    isActive(link){
        const linkCut = link.substring(ADMIN_BASE_URL.length+1).split('/')
        return linkCut[0]===this.currentLinkParts[0]
    }

    render() {
        const { classes, isAuthenticated, items, metaContent  } = this.props;



        return (
            <AppBar>
                <Toolbar position='static'>
                    <div className={classes.toolbarLeft}>
                    {items.map((item,i) => {
                        if( item.auth && isAuthenticated || !item.auth) {
                            const isActive = this.isActive(item.to)
                            return <Button raised={isActive}
                                           color={(isActive ? 'default' : 'inherit')}
                                           onClick={this.linkTo.bind(this, item)} key={i}>{item.name}</Button>
                        }
                    })}
                    </div>
                    {metaContent}
                </Toolbar>
            </AppBar>
        )
    }
}


HeaderMenu.propTypes = {
    items: PropTypes.array.isRequired,
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
)(withRouter(withStyles(styles,{ withTheme: true })(HeaderMenu)))