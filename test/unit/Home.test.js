import React from 'react'
import renderer from 'react-test-renderer'
import Home from 'client/components/Home'
import {UIProvider} from 'ui'
import {Provider} from 'react-redux'
import {createStore} from 'redux'
import rootReducer from 'client/reducers/index'
import {BrowserRouter as Router} from 'react-router-dom'
import {ApolloProvider} from '@apollo/client'
import {configureMiddleware} from 'client/middleware/index'
import UserDataContainer from 'client/containers/UserDataContainer'

describe('Test components', () => {

    it('Test home component', () => {

        const store = createStore(rootReducer)
        const client = configureMiddleware(store)

        const home = renderer.create(
            <Provider store={store}>
                <ApolloProvider client={client}>
                    <UIProvider>
                        <UserDataContainer>
                            <Router>
                                <Home></Home>
                            </Router>
                        </UserDataContainer>
                    </UIProvider>
                </ApolloProvider>
            </Provider>
        ).toJSON()

        expect(home.props).toEqual({className: 'layout'})

    })
})



