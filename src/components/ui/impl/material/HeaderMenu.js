import React from 'react'
import PropTypes from 'prop-types'
import {connect} from 'react-redux'
import {withRouter} from 'react-router-dom'

import { withStyles } from 'material-ui/styles'
import AppBar from 'material-ui/AppBar'
import Toolbar from 'material-ui/Toolbar'
import Button from 'material-ui/Button';

const styles = theme => ({
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
        const { theme, isAuthenticated, items } = this.props;

        const selectedTo = '/'+this.props.location.pathname.split('/')[1]

        return (
            <AppBar position='static'>
                <Toolbar>
                    <div style={{flex:1}}>
                    {items.map((item,i) => {
                        if( item.auth && isAuthenticated || !item.auth)
                            return <Button raised={(selectedTo===item.to)} color={(selectedTo===item.to?'default':'contrast')} onClick={this.linkTo.bind(this,item)} key={i}>{item.name}</Button>
                    })}
                    </div>
                    {!isAuthenticated && <Button color="contrast" onClick={this.linkTo.bind(this,{to:'/login'})}>Login</Button>}

                </Toolbar>
            </AppBar>
        );
    }
}


HeaderMenu.propTypes = {
    items: PropTypes.array.isRequired,
    /* UserReducer */
    isAuthenticated: PropTypes.bool,
    theme: PropTypes.object.isRequired
};


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