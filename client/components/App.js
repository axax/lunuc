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
import {Provider} from 'react-redux'

class App extends React.PureComponent {


    render() {
        return <Provider store={this.props.store}>
            <UserDataContainer>
                <Routes/>
            </UserDataContainer>
        </Provider>

    }
}


App.propTypes = {
    store: PropTypes.object.isRequired
}

export default App
