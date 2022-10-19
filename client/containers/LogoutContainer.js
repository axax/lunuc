import React from 'react'
import Util from 'client/util/index.mjs'
import {client} from '../middleware/graphql'


class LogoutContainer extends React.Component {

    constructor(props) {
        super(props)
    }

    logout = () => {

        client.query({
            fetchPolicy: 'network-only',
            query: 'query{logout{status}}'
        }).then(() => {

            _app_.dispatcher.setUser(null)

            // remove token and clear cache with a little delay in case there are componentWillUnmount events
            // clear user data
            try {
                // clear cache completely
                client.resetStore()
                //client.cache.saveToLocalStorage()
            } catch (e) {
                console.log(e)
            }
            localStorage.removeItem('token')
            let to = '/'
            const params = Util.extractQueryParams()
            if (params.forward) {
                to = params.forward
            }
            location.href = to


        })

    }

    render() {
        this.logout()
        return null
    }
}

export default LogoutContainer
