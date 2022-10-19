import React from 'react'
import PropTypes from 'prop-types'
import {client} from '../middleware/graphql'

class UserDataContainer extends React.PureComponent {

    state = {
        loading: false,
        loaded: false,
        hasAuth: !_app_.noStorage && (localStorage.getItem('token') || document.cookie.indexOf('authRole=')>=0),
        force:  !_app_.noStorage && localStorage.getItem('refreshUserData')
    }

    getUserData = () => {
        localStorage.removeItem('refreshUserData')

        client.query({
            fetchPolicy: (_app_.lang !== _app_.langBefore || this.state.force ? 'network-only' : 'cache-first'),
            query: 'query{me{username language email _id emailConfirmed group{_id} requestNewPassword picture{_id} role{_id capabilities} setting{_id}}}'
        }).then(response => {
            _app_.dispatcher.setUser(response.data.me)
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

    shouldComponentUpdate(nextProps, nextState, nextContext) {
        return this.state.loading !== nextState.loading
    }

    render() {
        console.log('Render UserDataContainer')
        if (this.state.loading && this.state.hasAuth) {
            this.getUserData()
            return null
        }
        return this.props.children
    }
}


UserDataContainer.propTypes = {
    children: PropTypes.object.isRequired
}

export default UserDataContainer
