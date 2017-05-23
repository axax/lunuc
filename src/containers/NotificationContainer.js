import React from 'react'
import PropTypes from 'prop-types'
import {withRouter} from 'react-router-dom'
import {gql, graphql, compose} from 'react-apollo'
import update from 'immutability-helper'


export class NotificationContainer extends React.Component {
	componentWillMount() {
		this.props.newNotification()
	}

	render (){
		let pairs = []
		const {notifications} = this.props
		if (notifications) {
			notifications.forEach(
				(notification) => pairs.push(<div key={notification.key}>{notification.message}</div>)
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
	notifications: PropTypes.array.isRequired,
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
  	notification{
			key
			message
		}
  }`


const NotificationContainerWithGql = compose(graphql(gqlQueryNotification, {
	name: 'notifications',
	options: ({ params }) => ({
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
						console.log(subscriptionData)
						if (!subscriptionData.data) {
							return prev
						}
						const newNotifications = subscriptionData.data.notification
						return Object.assign({}, prev, {
							notifications: [newNotifications, ...prev.notifications]
						})
					}
				})
			}
		}
	}
}))(NotificationContainer)


export default NotificationContainerWithGql