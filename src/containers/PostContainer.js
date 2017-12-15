import React from 'react'
import PropTypes from 'prop-types'
import {graphql, compose} from 'react-apollo'
import gql from 'graphql-tag'
import {connect} from 'react-redux'
import PostEditor from '../components/post/PostEditor'
import update from 'immutability-helper'
import Util from '../util'
import {Link} from 'react-router-dom'
import BaseLayout from '../components/layout/BaseLayout'
import GenericForm from '../components/generic/GenericForm'


class PostContainer extends React.Component {
    constructor(props) {
        super(props)
    }

	componentWillMount() {
	}


    handleAddPostClick = (post) => {
		const {createPost } = this.props
        createPost(post).then(()=>{
            this.addPostForm.reset()
        })
	}

    handleAddPostValidate = (post) => {
    	return post.title.trim()!==''
	}


    saveBodyTimeouts = {}
    handleBodyChange = (post,data) => {
        clearTimeout(this.saveBodyTimeouts[post._id])
        this.saveBodyTimeouts[post._id] = setTimeout(() => {
            console.log('save post')

            const {updatePost} = this.props
            updatePost(
                update(post, {body: {$set:data }})
            )

        },2000)
	}

    handlePostDeleteClick = (post) => {
        const {deletePost} = this.props
        deletePost({
            _id: post._id
        })
    }

    handleTitleChange = (event,post,lang) => {
        const t=event.target.innerText
        const {updatePost} = this.props
        updatePost(
            update(post, {title: {$set:t }})
        )
    }

	render() {
		const { posts, loading, match} = this.props
        const selectedPostId = match.params.id

		if( !posts )
            return <BaseLayout />

		var selectedPost = false

		return (
			<BaseLayout>
				<h1>Posts</h1>
				<ul>
                    {posts.map((post, i) => {
                        if (post._id === selectedPostId) {
                            selectedPost = post
                        }
                        const url = '/post/' + post._id
                        return <li key={i}>{['creating','deleting'].indexOf(post.status)>-1 ? <div>{post.title}
						</div>:<div><Link to={url}>{post.title}</Link> <button onClick={this.handlePostDeleteClick.bind(this, post)}>x</button></div>}
							<small><small>{Util.formattedDatetimeFromObjectId(post._id)}</small></small></li>
                    })}
				</ul>
				<GenericForm ref={(e) => {
                    this.addPostForm = e
                }} fields={{title:{value:'',placeholder:'Titel'},body:{value:'',type:'hidden'}}}  onValidate={this.handleAddPostValidate} onClick={this.handleAddPostClick} />


                {selectedPost ?
					<div>
						<h2 onBlur={(e) => this.handleTitleChange.bind(this)(e,selectedPost)} suppressContentEditableWarning contentEditable>{selectedPost.title}</h2>
						<PostEditor onChange={this.handleBodyChange.bind(this,selectedPost)} post={selectedPost}/>


					</div>
                    : ''}
			</BaseLayout>
		)
	}
}


PostContainer.propTypes = {
	/* routing params */
	match: PropTypes.object,
	/* apollo client props */
	loading: PropTypes.bool,
	posts: PropTypes.array,
	createPost: PropTypes.func.isRequired,
	updatePost: PropTypes.func.isRequired,
	deletePost: PropTypes.func.isRequired
}

const POSTS_PER_PAGE=100

const gqlQuery=gql`query{posts(limit: ${POSTS_PER_PAGE}){_id title body status createdBy{_id username}}}`
const PostContainerWithGql = compose(
	graphql(gqlQuery, {
		options() {
			return {
				fetchPolicy: 'cache-and-network'
			}
		},
        props: ({data: {loading, posts}}) => ({
            posts,
            loading
        })
	}),
	graphql(gql`mutation createPost($title: String!, $body: String){createPost(title:$title,body:$body){_id title body createdBy{_id username} status}}`, {
		props: ({ownProps, mutate}) => ({
            createPost: ({title, body}) => {
				return mutate({
					variables: {title, body},
					optimisticResponse: {
						__typename: 'Mutation',
						// Optimistic message
                        createPost: {
							_id: '#' + new Date().getTime(),
							body,
							title,
							status: 'creating',
							createdBy: {
								_id: ownProps.user.userData._id,
								username: ownProps.user.userData.username,
								__typename: 'UserPublic'
							},
							__typename: 'Post'
						}
					},
					update: (store, {data: {createPost}}) => {
						//console.log('createPost', createPost)
						// Read the data from the cache for this query.
						const data = store.readQuery({query: gqlQuery})

						data.posts.push(createPost)
						store.writeQuery({query: gqlQuery, data})
					}
				})
			}
		}),
	}),
	graphql(gql`mutation updatePost($_id: ID!,$body: String, $title: String){updatePost(_id:$_id,body:$body,title:$title){_id body title createdBy{_id username} status}}`, {
		props: ({ownProps, mutate}) => ({
            updatePost: ({_id, body, title}) => {
				return mutate({
					variables: {_id, body, title},
					optimisticResponse: {
						__typename: 'Mutation',
						// Optimistic message
                        updatePost: {
							_id,
							body,
							title,
							status: 'updating',
							createdBy: {
								_id: ownProps.user.userData._id,
								username: ownProps.user.userData.username,
								__typename: 'UserPublic'
							},
							__typename: 'Post'
						}
					},
					update: (store, {data: {updatePost}}) => {
						//console.log('updatePost', updatePost)
						// Read the data from the cache for this query.
						const data = store.readQuery({query: gqlQuery})
                        const idx = data.posts.findIndex(x => x._id === updatePost._id)
                        if (idx > -1) {
							data.posts[idx]=updatePost
                            store.writeQuery({query: gqlQuery, data})
                        }
					}
				})
			}
		}),
	}),
    graphql(gql`mutation deletePost($_id: ID!){deletePost(_id: $_id){_id status}}`, {
        props: ({ownProps, mutate}) => ({
            deletePost: ({_id}) => {
                return mutate({
                    variables: {_id},
                    optimisticResponse: {
                        __typename: 'Mutation',
                        deletePost: {
                            _id: _id,
                            status: 'deleting',
                            __typename: 'Post'
                        }
                    },
                    update: (store, {data: {deletePost}}) => {
                        console.log('deletePost', deletePost)
                        // Read the data from the cache for this query.
                        const data = store.readQuery({query: gqlQuery})

                        const idx = data.posts.findIndex((e) => e._id === deletePost._id)
                        if (idx >= 0) {
                            if( deletePost.status == 'deleting' ){
                                console.log(data.posts[idx])
                                data.posts[idx].status = 'deleting'
                            }else {
                                data.posts.splice(idx, 1)
                            }
                            store.writeQuery({query: gqlQuery, data})
                        }

                    }
                })
            }
        })
    })
)(PostContainer)


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
)(PostContainerWithGql)

