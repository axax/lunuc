import React from 'react'
import {bindActionCreators} from 'redux'
import {connect} from 'react-redux'
import PropTypes from 'prop-types'
import * as UserActions from 'client/actions/UserAction'
import {withApollo} from '@apollo/react-hoc'
import { ApolloClient } from '@apollo/client'
import Util from 'client/util'


class LogoutContainer extends React.Component {

    constructor(props) {
        super(props)
        this.logout()
    }

    logout = () => {
        const {userActions, client} = this.props
        userActions.setUser(null, false)

        // remove token and clear cache with a little delay in case there are componentWillUnmount events
        setTimeout(()=>{
            // clear user data
            try {
                // clear cache completely
                client.resetStore()
                //client.cache.saveToLocalStorage()
            }catch (e){
                console.log(e)
            }
            localStorage.removeItem('token')
            let to = '/'
            const params = Util.extractQueryParams()
            if (params.forward) {
                to = params.forward
            }
            location.href = to

        },250)
    }

    render() {
        return null
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
