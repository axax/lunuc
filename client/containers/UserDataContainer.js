import React from 'react'
import {client} from '../middleware/graphql'

class UserDataContainer extends React.Component {

    state = {
        loading: false,
        loaded: false,
        hasAuth: !_app_.noStorage && (localStorage.getItem('token') || document.cookie.indexOf('authRole=')>=0),
        force:  !_app_.noStorage && localStorage.getItem('refreshUserData')
    }

    getUserData = (tries = 0) => {
        if(this.state.loading && this.state.hasAuth) {
            localStorage.removeItem('refreshUserData')
            client.query({
                fetchPolicy: (this.state.force ? 'network-only' : 'cache-first'),
                query: 'query{me{username domain language email _id emailConfirmed group{_id} requestNewPassword picture{_id} role{_id capabilities setting{_id}} setting{_id}}}'
            }).then(response => {
                _app_.dispatcher.setUser(response.data.me)
                this.setState({loading: false, loaded: true})
            }).catch(error => {
                if(tries<10 && error.error.message==='Gateway Timeout'){
                    setTimeout(()=> {
                        this.getUserData(tries + 1)
                    },1000)
                }else{
                    this.setState({loading: false, loaded: true})
                }
                console.log(error)

            })
        }
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

    componentDidMount() {
        this.getUserData()
    }

    render() {
        console.log(`Render UserDataContainer ${this.state.hasAuth}`)
        if (this.state.loading && this.state.hasAuth) {
            return null
        }
        return this.props.children
    }
}

export default UserDataContainer
