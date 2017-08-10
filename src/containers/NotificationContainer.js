import React from 'react'
import PropTypes from 'prop-types'
import {gql, graphql, compose} from 'react-apollo'
import update from 'immutability-helper'


class NotificationContainer extends React.Component {
	componentWillMount() {
		this.props.newNotification()
	}

	render (){
		let pairs = []
		const {notifications} = this.props
		if (notifications) {
			notifications.forEach(
				(notification ) => pairs.push(<div key={notification.key}>{notification.message}</div>)
			)
		}

		if( pairs.length>0 ){
			return <div>
				{pairs}
			</div>
		}

		return null
	}
}


NotificationContainer.propTypes = {
	notifications: PropTypes.array,
	newNotification: PropTypes.func.isRequired
}



const gqlQueryNotification = gql`
  query {
  	notifications{
			key
			message
		}
  }`

const gqlSubscriptionNotification = gql`
  subscription{
  	newNotification{
			key
			message
		}
  }`


const NotificationContainerWithGql = compose(graphql(gqlQueryNotification, {
	name: 'notifications',
	options: ({ params }) => ({
		fetchPolicy: 'network-only',
		variables: {
		},
	}),
	props: props => {
		return {
			notifications: props.notifications.notifications,
			newNotification: params => {
				return props.notifications.subscribeToMore({
					document: gqlSubscriptionNotification,
					variables: {
					},
					updateQuery: (prev, {subscriptionData}) => {
						if (!subscriptionData.data) {
							return prev
						}
						const {newNotification} = subscriptionData.data

						let newNotifications = []
						if( prev.notifications ) {
							newNotifications = prev.notifications.filter((n) => {
								return (n.key !== newNotification.key)
							})
						}
						newNotifications.push(newNotification)

						return update(prev, {notifications: {$set: newNotifications}})

					}
				})
			}
		}
	}
}))(NotificationContainer)


export default NotificationContainerWithGql