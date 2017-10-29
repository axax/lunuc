import React from 'react'
import PropTypes from 'prop-types'
import { PersistGate } from 'redux-persist/es/integration/react'
import Routes from './routing/Routes'
import UserDataContainer from '../containers/UserDataContainer'

/*
 * The Provider component provides
 * the React store to all its child
 * components so we don't need to pass
 * it explicitly to all the components.
 */
//import {Provider} from 'react-redux'
import {ApolloProvider} from 'react-apollo'
import {client} from '../middleware/index'



class App extends React.PureComponent {


	render() {

        const onBeforeLift = () => {
            // take some action before the gate lifts
        }

        const afterPersist = <ApolloProvider store={this.props.store} client={client}>
			<UserDataContainer>
				<Routes />
			</UserDataContainer>
		</ApolloProvider>

        const Loading = () => (
			<div>
				<strong>...loading</strong>
			</div>
        )

        if (this.props.persistor) {
            return (
				<PersistGate
					loading={<Loading />}
					onBeforeLift={onBeforeLift}
					persistor={this.props.persistor}>
                    {afterPersist}
				</PersistGate>)
        }else{
            return afterPersist
		}

	}
}



App.propTypes = {
	store: PropTypes.object.isRequired,
    persistor: PropTypes.object
}

export default App
