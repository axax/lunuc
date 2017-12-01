import React from 'react'
import PropTypes from 'prop-types'
import {graphql, compose} from 'react-apollo'
import gql from 'graphql-tag'
import {connect} from 'react-redux'


class CmsContainer extends React.Component {
    constructor(props) {
        super(props)
    }
	componentWillMount() {
	}
	render() {
		const { cmsPage, loading } = this.props

		console.log('render cmsContainer', loading)
        if( !cmsPage )
            return null

		return (
			<div>
				<h1>{cmsPage.slug}</h1>
			</div>
		)
	}
}


CmsContainer.propTypes = {
	/* routing params */
	match: PropTypes.object,
	/* apollo client props */
	loading: PropTypes.bool,
    cmsPage: PropTypes.object
}

const gqlQuery=gql`query cmsPage($slug: String!){ cmsPage(slug: $slug){slug _id createdBy{_id username}}}`
const CmsContainerWithGql = compose(
	graphql(gqlQuery, {
		options(ownProps) {
		    let slug=(ownProps.match.params.slug)
			return {
                variables: {
                   slug
                },
                fetchPolicy: 'cache-and-network'
			}
		},
        props: ({data: {loading, cmsPage}}) => ({
            cmsPage,
            loading
        })
    })
)(CmsContainer)


/**
 * Map the state to props.
 */
const mapStateToProps = (store) => {
	const {user} = store
	return {
		user
	}
}


/**
 * Connect the component to
 * the Redux store.
 */
export default connect(
	mapStateToProps
)(CmsContainerWithGql)

