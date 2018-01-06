import React from 'react'
import PropTypes from 'prop-types'
import {graphql, compose} from 'react-apollo'
import gql from 'graphql-tag'
import {connect} from 'react-redux'
import BaseLayout from '../components/layout/BaseLayout'
import ContentEditable from '../components/generic/ContentEditable'
import logger from '../logger'
import {DrawerLayout,Button,MenuList,MenuListItem,Divider,Col,Row,Textarea} from '../components/ui/'
import update from 'immutability-helper'


class JsonDom extends React.Component {

    components = {
		'Button': Button,
		'Divider': Divider,
		'Col': Col,
		'Row': Row,
	}


    constructor(props) {
        super(props)
    }

    parseRec(a){
        if( !a ) return null
		if( a.constructor === String) return a
        let h = []
        a.forEach(({type,props,children,t,p,c},key) => {
            h.push(React.createElement(
                this.components[type || t] || type || t || 'div',
				{key,...props,...p},
                this.parseRec(children||c)
            ))
        })
		return h
	}

    render() {
    	const {json} = this.props

		return this.parseRec(json)

    }

}




class CmsViewContainer extends React.Component {
    static logger = logger(CmsViewContainer.name)

    state = {
        jsonContent: ''
    }

	componentWillMount() {
	}


    saveCmsPage = (value, data, key) => {
        const t = value.trim()
        if (t != data[key]) {
            const {updateCmsPage} = this.props
            updateCmsPage(
                update(data, {[key]: {$set: t}})
            )
        }
    }


    handleJsonContentChange = (value) => {
        this.setState({jsonContent: value.trim()})
    }

    componentWillReceiveProps(nextProps) {
        if (nextProps.cmsPage) {
        	/*let prettyJson
            prettyJson = JSON.stringify(JSON.parse(nextProps.cmsPage.jsonContent),null,4)*/

            this.setState({jsonContent:nextProps.cmsPage.jsonContent})
        }
    }


    render() {
		const { cmsPage, loading, user } = this.props
		const { jsonContent } = this.state

        if( !cmsPage )
            return <BaseLayout />



        let json=[], jsonError
        try {
            json = eval('(' + jsonContent + ')') //JSON.parse()

        }catch(e){
            jsonError=e
        }


		const sidebar = () => <div>
			<MenuList>
				<MenuListItem button primary="Text label" />
			</MenuList>
            <Divider />

			<ContentEditable
				 onChange={this.handleJsonContentChange}
				 onBlur={value => this.saveCmsPage.bind(this)(value, cmsPage, 'jsonContent')}>{jsonContent}</ContentEditable>

			{jsonError && jsonError.message}

		</div>


		/*const json = [
				{t:'div', p: {}, c: [
					{t:'h1',c:'T-Shirt'},
					{t:'h2',c:'Wowi'},
					{t:'Row',c:[
						{t:'Col',p:{md:6},c:'ss'},
						{t:'Col',p:{md:6},c:[{t:'img',p:{src:'http://majoumo.com/images/shirt/shirt2.jpg'}}]}
					]},
					{t:'Divider'},
					{t:'Button',c:'zzz'}
				]}
			]*/


		const content = <div>
			<h1>{cmsPage.slug}</h1>
			{cmsPage.htmlContent}
			<JsonDom json={json} />
		</div>



		return (
			<div id="container">
                {user.isAuthenticated ?

					<DrawerLayout sidebar={sidebar()}
								  drawerWidth="500px"
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
    user: PropTypes.object,
	updateCmsPage: PropTypes.func.isRequired
}

const gqlQuery=gql`query cmsPage($slug: String!){ cmsPage(slug: $slug){slug jsonContent htmlContent _id createdBy{_id username}}}`
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
    }),
    graphql(gql`mutation updateCmsPage($_id: ID!,$jsonContent: String,$slug: String){updateCmsPage(_id:$_id,jsonContent:$jsonContent,slug: $slug){slug jsonContent htmlContent _id createdBy{_id username} status}}`, {
        props: ({ownProps, mutate}) => ({
            updateCmsPage: ({_id, jsonContent,slug, htmlContent}) => {
                return mutate({
                    variables: {_id, jsonContent, slug},
                    optimisticResponse: {
                        __typename: 'Mutation',
                        // Optimistic message
                        updateCmsPage: {
                            _id,
                            jsonContent,
                            slug,
                            htmlContent,
                            status: 'updating',
                            createdBy: {
                                _id: ownProps.user.userData._id,
                                username: ownProps.user.userData.username,
                                __typename: 'UserPublic'
                            },
                            __typename: 'CmsPage'
                        }
                    },
                    update: (store, {data: {updateCmsPage}}) => {
                        //console.log('updatePost', updatePost)
                        // Read the data from the cache for this query.
                        let slug=(ownProps.match.params.slug)
                        const data = store.readQuery({query: gqlQuery,variables: {slug}})
                        if (data.cmsPage) {
                            data.cmsPage = updateCmsPage
                            store.writeQuery({query: gqlQuery, variables: {slug}, data})
                        }
                    }
                })
            }
        }),
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

