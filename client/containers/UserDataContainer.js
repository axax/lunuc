import React from 'react'
import PropTypes from 'prop-types'
import {bindActionCreators} from 'redux'
import {connect} from 'react-redux'
import * as UserActions from 'client/actions/UserAction'
import {USER_DATA_QUERY} from '../constants'
import {client} from '../middleware/graphql'

class UserDataContainer extends React.PureComponent {
    state = {
        loading: false,
        loaded: false,
        token: localStorage.getItem('token') || '',
        force:  localStorage.getItem('refreshUserData')
    }

    getUserData = () => {
        const {userActions} = this.props
        localStorage.setItem('refreshUserData', null)

        client.query({
            fetchPolicy: (_app_.lang !== _app_.langBefore || this.state.force ? 'network-only' : 'cache-first'),
            query: USER_DATA_QUERY
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
        if (this.state.loading && this.state.token != '') {
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
