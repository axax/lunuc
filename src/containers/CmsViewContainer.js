import React from 'react'
import PropTypes from 'prop-types'
import {graphql, compose} from 'react-apollo'
import gql from 'graphql-tag'
import {connect} from 'react-redux'
import BaseLayout from '../components/layout/BaseLayout'
import logger from '../logger'
import {DrawerLayout,Button,MenuList,MenuListItem,Divider} from '../components/ui/'



class CmsViewContainer extends React.Component {
    static logger = logger(CmsViewContainer.name)

	componentWillMount() {
	}

    render() {
		const { cmsPage, loading, user } = this.props

        if( !cmsPage )
            return <BaseLayout />


		const sidebar = () => <div>
			<MenuList>
				<MenuListItem button primary="Text label" />
			</MenuList>
            <Divider />
            <MenuList></MenuList>
		</div>

		const json = {
			components:[
				{type:'label'}
			]
		}

		const content = <div>

			<h1>{cmsPage.slug}</h1>

		</div>



		return (
			<div id="container">
                {user.isAuthenticated ?

					<DrawerLayout sidebar={sidebar()}
						title={'Edit Page "'+cmsPage.slug+'"'}>


                        {content}

					</DrawerLayout>
                :content}
			</div>
		)
	}
}


CmsViewContainer.propTypes = {
    users: PropTypes.array,
	match: PropTypes.object,
	loading: PropTypes.bool,
    cmsPage: PropTypes.object,
    user: PropTypes.object
}

const gqlQuery=gql`query cmsPage($slug: String!){ cmsPage(slug: $slug){slug _id createdBy{_id username}}}`
const CmsViewContainerWithGql = compose(
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
)(CmsViewContainer)


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
)(CmsViewContainerWithGql)

