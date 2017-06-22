import React from 'react'
import {persistStore,createTransform} from 'redux-persist'
import PropTypes from 'prop-types'


/*
 * The Provider component provides
 * the React store to all its child
 * components so we don't need to pass
 * it explicitly to all the components.
 */
//import {Provider} from 'react-redux'
import {ApolloProvider} from 'react-apollo'
import {client} from '../middleware/index'

import Routes from './Routes'
import UserDataContainer from '../containers/UserDataContainer'
import Environment from '../environment'


class App extends React.PureComponent {
	state = { rehydrated: !Environment.REDUX_PERSIST }

	componentWillMount() {
		if( Environment.REDUX_PERSIST ) {
			const transform = createTransform(
				(state, key) => {

					return state
				},
				(state, key) => {
					let newState = Object.assign({}, state)
					newState.mutations = {}
					newState.queries = {}

					// Filter some queries we don't want to persist
					newState.data = Object.keys(state.data)
						.filter(key => key.indexOf('$ROOT_QUERY.login') < 0 && key.indexOf('ROOT_QUERY.notification') < 0 && key.indexOf('ROOT_SUBSCRIPTION.notification') < 0)
						.reduce((res, key) => (res[key] = state.data[key], res), {})

					return newState
				},
				{whitelist: ['remote']}
			)

			persistStore(this.props.store, {transforms: [transform], blacklist: ['keyvalue', 'errorHandler', 'user']}, () => {
				this.setState({rehydrated: true})
			})
		}
	}

	render() {
		if(!this.state.rehydrated)
			return <div>loading...</div>

		return (
			<ApolloProvider store={this.props.store} client={client}>
				<UserDataContainer>
					<Routes />
				</UserDataContainer>
			</ApolloProvider>
		)
	}
}


App.propTypes = {
	store: PropTypes.object.isRequired
}

export default App
