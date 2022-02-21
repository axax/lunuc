import React from 'react'
import PropTypes from 'prop-types'
import {bindActionCreators} from 'redux'
import {connect} from 'react-redux'
import * as UserActions from 'client/actions/UserAction'
import {client} from '../middleware/graphql'

class UserDataContainer extends React.PureComponent {
    state = {
        loading: false,
        loaded: false,
        hasAuth: !_app_.noStorage && (localStorage.getItem('token') || document.cookie.indexOf('authRole=')>=0),
        force:  !_app_.noStorage && localStorage.getItem('refreshUserData')
    }



    getUserData = () => {
        const {userActions} = this.props
        localStorage.removeItem('refreshUserData')

        client.query({
            fetchPolicy: (_app_.lang !== _app_.langBefore || this.state.force ? 'network-only' : 'cache-first'),
            query: 'query{me{username language email _id emailConfirmed group{_id} requestNewPassword picture{_id} role{_id capabilities}}}'
        }).then(response => {
            _app_.user = response.data.me
            userActions.setUser(response.data.me, !!response.data.me)
            this.setState({loading: false, loaded: true})
        }).catch(error => {
            console.log(error)
            this.setState({loading: false, loaded: true})
        })
    }

    static getDerivedStateFromProps(nextProps, prevState) {
        if (!prevState.loaded) {
            return Object.assign({}, prevState, {loading: true})
        }
        return null
    }

    componentDidCatch(error, errorInfo) {
        // You can also log the error to an error reporting service
        console.log(error, errorInfo)
    }

    render() {
        if (this.state.loading && this.state.hasAuth) {
            this.getUserData()
            return null
        }
        return this.props.children
    }
}


UserDataContainer.propTypes = {
    children: PropTypes.object.isRequired,
    /* UserReducer */
    userActions: PropTypes.object.isRequired
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
    userActions: bindActionCreators(UserActions, dispatch)
})


/**
 * Connect the component to
 * the Redux store.
 */
export default connect(
    mapStateToProps,
    mapDispatchToProps
)(UserDataContainer)
