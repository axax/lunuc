import React from 'react'
import {bindActionCreators} from 'redux'
import {connect} from 'react-redux'
import PropTypes from 'prop-types'
import * as UserActions from '../actions/UserAction'
import {withApollo, gql} from 'react-apollo'
import ApolloClient from 'apollo-client'

class UserDataContainer extends React.PureComponent {
	state = {
		loading: false
	}

	getUserData = () => {
		this.setState({loading: true})
		const {client, userActions} = this.props

		client.query({
			fetchPolicy: 'network-only',
			query: gql`query {me{username email _id note{_id value}role{capabilities}}}`,
			variables: {
				_errorHandling: false
			}
		}).then(response => {
			this.setState({loading: false})
			userActions.setUser(response.data.me,true)
		}).catch(error => {
			this.setState({loading: false})
		})
	}

	componentWillMount() {
		this.getUserData()
	}


	render() {

		const {loading} = this.state
		if (loading)
			return <div>loading user data...</div>

		return this.props.children
	}
}


UserDataContainer.propTypes = {
	client: React.PropTypes.instanceOf(ApolloClient).isRequired,
	children: PropTypes.object.isRequired,
	/* UserReducer */
	userActions: PropTypes.object.isRequired
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
	userActions: bindActionCreators(UserActions, dispatch)
})


/**
 * Make ApolloClient accessable
 */
const UserDataContainerWithApollo = withApollo(UserDataContainer)


/**
 * Connect the component to
 * the Redux store.
 */
export default connect(
	mapStateToProps,
	mapDispatchToProps
)(UserDataContainerWithApollo)
