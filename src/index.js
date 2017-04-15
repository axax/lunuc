import React from 'react'
import {render} from 'react-dom'

/*
 * The Provider component provides
 * the React store to all its child
 * components so we don't need to pass
 * it explicitly to all the components.
 */
//import {Provider} from 'react-redux'
import {ApolloProvider} from 'react-apollo'
import {client} from './middleware/index'

import Routes from './routes'

import configureStore from './store/index'

const store = configureStore()

render(
	<ApolloProvider store={store} client={client}>
		<Routes />
	</ApolloProvider>,
	document.getElementById('app')
)
