import React from 'react'
import {render} from 'react-dom'
import App from './components/App'


/*
 * The Provider component provides
 * the React store to all its child
 * components so we don't need to pass
 * it explicitly to all the components.
 */
//import {Provider} from 'react-redux'
import { ApolloProvider } from 'react-apollo'
import { client } from './middleware/index'


import configureStore from './store/index'

const store = configureStore()

render(
  <ApolloProvider store={store} client={client}>
    <App />
  </ApolloProvider>,
  document.getElementById('app')
)
