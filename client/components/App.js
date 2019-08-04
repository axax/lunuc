import React from 'react'
import PropTypes from 'prop-types'
import Routes from './routing/Routes'
import UserDataContainer from 'client/containers/UserDataContainer'

/*
 * The Provider component provides
 * the React store to all its child
 * components so we don't need to pass
 * it explicitly to all the components.
 */
import {ApolloProvider} from 'react-apollo'
import {configureMiddleware} from '../middleware/index'
import {Provider} from 'react-redux'



class App extends React.PureComponent {


    render() {
        console.log('render App')

        const client = configureMiddleware(this.props.store)
        console.log('App',client)
        return <Provider store={this.props.store}>
                <ApolloProvider client={client}>
                    <UserDataContainer>
                        <Routes />
                    </UserDataContainer>
                </ApolloProvider>
            </Provider>

    }
}


App.propTypes = {
    store: PropTypes.object.isRequired
}

export default App
