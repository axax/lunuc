import React from 'react'
import {bindActionCreators} from 'redux'
import {connect} from 'react-redux'
import PropTypes from 'prop-types'
import {Redirect} from 'react-router-dom'
import * as UserActions from 'client/actions/UserAction'
import {withApollo} from 'react-apollo'
import ApolloClient from 'apollo-client'
import Util from 'client/util'


class LogoutContainer extends React.Component {

    constructor(props) {
        super(props)

        this.logout()
    }

    logout = () => {
        const {userActions, client} = this.props
        localStorage.removeItem('token')
        userActions.setUser(null, false)
        // clear user data
        delete client.cache.data.data.ROOT_QUERY.me
        client.cache.saveToLocalStorage()
    }

    render() {
        let to = {pathname: '/'}
        if (window.location.hash) {
            const params = Util.extractQueryParams(window.location.hash.substring(1))
            if (params.forward) {
                to = {pathname: params.forward}
            }
        }


        return <Redirect to={to} push={false}/>
    }
}


LogoutContainer.propTypes = {
    client: PropTypes.instanceOf(ApolloClient).isRequired,
    /* UserReducer */
    userActions: PropTypes.object.isRequired,
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
    userActions: bindActionCreators(UserActions, dispatch),
})


/**
 * Connect the component to
 * the Redux store.
 */
export default connect(
    mapStateToProps,
    mapDispatchToProps
)(withApollo(LogoutContainer))
