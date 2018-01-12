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
import Hook from '../../util/hook'


class JsonDom extends React.Component {


    components = {
		'Button': Button,
		'Divider': Divider,
		'Col': Col,
		'Row': Row,
		'h1': ({ id,...rest }) => <h1><ContentEditable onChange={(v)=>this.emitChange(id,v)} onBlur={(v)=>this.emitChange(id,v,true)} {...rest} /></h1>,
		'h2': ({ id,...rest }) => <h2><ContentEditable onChange={(v)=>this.emitChange(id,v)} onBlur={(v)=>this.emitChange(id,v,true)} {...rest} /></h2>,
		'p': ({ id,...rest }) => <p><ContentEditable onChange={(v)=>this.emitChange(id,v)} onBlur={(v)=>this.emitChange(id,v,true)} {...rest} /></p>
	}


    constructor(props) {
        super(props)
        this.state = { hasError: false }

        Hook.call('JsonDom', {components:this.components})


    }

    emitChange(id,v,save){
        const {json, onJsonChange } = this.props

		if( !onJsonChange )
			return

        var jsonClone = Object.assign([], json)
    	const ids = id.split('.')
		ids.shift()

		let cur = jsonClone
		ids.forEach((i)=>{
        	if( cur.c ){
        		cur = cur.c[i]
			}else{
        		cur = cur[i]
			}
		})
		cur.c = v

        onJsonChange(jsonClone,save)
	}

    parseRec(a,rootKey){
        if( !a ) return null
		if( a.constructor === String) return a
        let h = []
        a.forEach(({type,props,children,t,p,c},i) => {
        	const key = rootKey+'.'+i
            h.push(React.createElement(
                this.components[type || t] || type || t || 'div',
				{id:key,key,...props,...p},
                this.parseRec(children||c,key)
            ))
        })
		return h
	}


    componentDidCatch(error, info) {
        this.setState({ hasError: true })
    }

    componentWillReceiveProps(nextProps, nextState){
        this.setState({ hasError: false })

    }

    render() {
    	const {json} = this.props
    	const {hasError} = this.state
        if (hasError) {
            return <strong>There is something wrong with your json. See console.log for more detail.</strong>
		}else{
            return this.parseRec(json,0)
		}

    }

}

JsonDom.propTypes = {
    json: PropTypes.array,
    onJsonChange: PropTypes.func
}




class CmsViewContainer extends React.Component {
    static logger = logger(CmsViewContainer.name)

    state = {
        jsonContent: ''
    }


    saveCmsPage = (value, data, key) => {
        const t = value.trim()
		console.log('save cms',key)
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

    handleJsonChange = (json,save) => {
    	const jsonContent = JSON.stringify(json,null,4)
		if( save ){
            this.saveCmsPage(jsonContent,this.props.cmsPage,'jsonContent')
		}else{
            this.setState({jsonContent})
        }
    }

    componentWillReceiveProps(nextProps) {
        if (nextProps.cmsPage) {
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
        	console.log(jsonContent)
            jsonError=e
        }


		const sidebar = () => <div>
			<MenuList>
				<MenuListItem onClick={e=>{window.location='/'}} button primary="Home" />
			</MenuList>
            <Divider />

			<ContentEditable
				style={{backgroundColor:'#fff',minHeight:200,overflow:'auto', whiteSpace: 'pre', fontFamily: 'monospace'}}
				onChange={this.handleJsonContentChange}
				 onBlur={value => this.saveCmsPage.bind(this)(value, cmsPage, 'jsonContent')}>{jsonContent}</ContentEditable>

			{jsonError && jsonError.message}

		</div>


		const content = <div>
			<h1>{cmsPage.slug}</h1>
			{cmsPage.htmlContent}
			<JsonDom json={json} onJsonChange={this.handleJsonChange} />
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

