import React from 'react'
import PropTypes from 'prop-types'
import {bindActionCreators} from 'redux'
import {connect} from 'react-redux'
import * as UserActions from 'client/actions/UserAction'
import {withApollo} from 'react-apollo'
import gql from 'graphql-tag'
import ApolloClient from 'apollo-client'
import {USER_DATA_QUERY} from '../constants'

class UserDataContainer extends React.PureComponent {
	state = {
		loading: false
	}

	getUserData = () => {
		const {client, userActions} = this.props

		const token = localStorage.getItem('token')

		if( token && token != ''){
			this.setState({loading: true})

			client.query({
				fetchPolicy: 'cache-first',
				query: gql(USER_DATA_QUERY)
			}).then(response => {
				userActions.setUser(response.data.me, !!response.data.me)
				this.setState({loading: false})
			}).catch(error => {
				this.setState({loading: false})
			})
		}


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
	client: PropTypes.instanceOf(ApolloClient).isRequired,
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
