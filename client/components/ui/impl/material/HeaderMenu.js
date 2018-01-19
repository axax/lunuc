import React from 'react'
import PropTypes from 'prop-types'
import {connect} from 'react-redux'
import {withRouter} from 'react-router-dom'
import { withStyles } from 'material-ui/styles'
import AppBar from 'material-ui/AppBar'
import Toolbar from 'material-ui/Toolbar'
import Button from 'material-ui/Button'

const styles = theme => ({
    toolbarLeft: {
        flex:1
    }
})

class HeaderMenu extends React.Component {
    constructor() {
        super();
        this.state = {
            selectedKeys: []
        }
    }
    componentWillReceiveProps() {
        this.setState({ selectedKeys: ['/'+this.props.location.pathname.split('/')[1]] });
    }

    componentDidMount() {

        this.setState({ selectedKeys: [] });
    }

    linkTo(item) {
        this.props.history.push(item.to);
    }
    render() {
        const { classes, isAuthenticated, items, metaContent  } = this.props;

        const selectedTo = '/'+this.props.location.pathname.split('/')[1]

        return (
            <AppBar>
                <Toolbar  position='static'>
                    <div className={classes.toolbarLeft}>
                    {items.map((item,i) => {
                        if( item.auth && isAuthenticated || !item.auth)
                            return <Button raised={(selectedTo===item.to)} color={(selectedTo===item.to?'default':'contrast')} onClick={this.linkTo.bind(this,item)} key={i}>{item.name}</Button>
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