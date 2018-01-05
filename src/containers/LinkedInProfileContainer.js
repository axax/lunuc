import React from 'react'
import PropTypes from 'prop-types'
import {graphql, compose} from 'react-apollo'
import gql from 'graphql-tag'
import {DrawerLayout,Button} from '../components/ui/'



class LinkedInProfileContainer extends React.Component {

    render() {
		const { linkedin, loading } = this.props

        if( !linkedin )
            return null


		return (
			<div>
				<h3>LinkedIn Profile Data</h3>
				<img src={linkedin.pictureUrl} />
				<p>
				<strong>{linkedin.firstName} {linkedin.lastName} ({linkedin.headline})</strong><br />
					{linkedin.summary}
				</p>
			</div>
		)
	}
}


LinkedInProfileContainer.propTypes = {
	loading: PropTypes.bool,
    linkedin: PropTypes.object
}

const linkedInRedirectUrl = `${window.location.protocol}//${window.location.hostname}:${window.location.port}/profile`

const gqlQuery=gql`query {linkedin(redirectUri:"${linkedInRedirectUrl}"){headline firstName lastName pictureUrl summary positions{_total values{title summary} }}}`
const LinkedInProfileContainerWithGql = compose(
	graphql(gqlQuery, {
		options(ownProps) {
			return {
                fetchPolicy: 'cache-and-network'
			}
		},
        props: ({data: {loading, linkedin}}) => ({
            linkedin,
            loading
        })
    })
)(LinkedInProfileContainer)

export default LinkedInProfileContainerWithGql

