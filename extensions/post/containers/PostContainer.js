import React from 'react'
import PropTypes from 'prop-types'
import {graphql, compose} from 'react-apollo'
import gql from 'graphql-tag'
import {connect} from 'react-redux'
import PostEditor from '../components/post/PostEditor'
import Util from 'client/util'
import {Link} from 'react-router-dom'
import BaseLayout from 'client/components/layout/BaseLayout'
import GenericForm from 'client/components/generic/GenericForm'
import {Row, Col, Typography, SimpleList, DeleteIconButton, SimpleDialog} from 'ui/admin'
import config from 'gen/config'
const {ADMIN_BASE_URL} = config

class PostContainer extends React.Component {
    constructor(props) {
        super(props)

        this.state = {
            confirmDeletionDialog: true,
            dataToDelete: null
        }
    }

    handleAddPostClick = (post) => {
        const {createPost} = this.props
        createPost(post).then(() => {
            this.addPostForm.reset()
        })
    }

    handleAddPostValidate = (post) => {
        return post.title.trim() !== ''
    }


    saveBodyTimeouts = {}
    handleBodyChange = (post, data) => {
        clearTimeout(this.saveBodyTimeouts[post._id])
        this.saveBodyTimeouts[post._id] = setTimeout(() => {
            console.log('save post')

            const {updatePost} = this.props
            updatePost(
                Object.assign({}, post, {body: data})
            )

        }, 2000)
    }

    handlePostDeleteClick = (post) => {
        this.setState({confirmDeletionDialog: true, dataToDelete: post})
    }


    handleConfirmDeletion = (action) => {
        if (action && action.key === 'yes') {
            const {deletePost} = this.props
            deletePost({
                _id: this.state.dataToDelete._id
            })
        }
        this.setState({confirmDeletionDialog: false, dataToDelete: false})
    }

    handleTitleChange = (event, post, lang) => {
        const t = event.target.innerText
        const {updatePost} = this.props
        updatePost(
            Object.assign({}, post, {title: t})
        )
    }

    render() {
        const {posts, loading, match,history} = this.props
        const selectedPostId = match.params.id

        if (!posts)
            return <BaseLayout />

        let selectedPost = false

        const listItems = posts.reduce((a, post) => {
            if (post._id === selectedPostId) {
                selectedPost = post
            }
            a.push({
                selected: post._id === selectedPostId,
                primary: post.title,
                onClick: () => {
                    history.push(ADMIN_BASE_URL + '/post/' + post._id)
                },
                secondary: Util.formattedDatetimeFromObjectId(post._id),
                actions: <DeleteIconButton onClick={this.handlePostDeleteClick.bind(this, post)}/>,
                disabled: ['creating', 'deleting'].indexOf(post.status) > -1
            })
            return a
        }, [])


        return (
            <BaseLayout>
                <Typography variant="display2" gutterBottom>Posts</Typography>
                <Row spacing={24}>
                    <Col md={4}>
                        <SimpleList items={listItems}/>

                        <GenericForm ref={(e) => {
                            this.addPostForm = e
                        }} fields={{title: {value: '', placeholder: 'Titel'}, body: {value: '', type: 'hidden'}}}
                                     onValidate={this.handleAddPostValidate} onClick={this.handleAddPostClick}/>

                    </Col>
                    <Col md={8}>
                        {selectedPost ?
                            <div>
                                <h2 onBlur={(e) => this.handleTitleChange.bind(this)(e, selectedPost)}
                                    suppressContentEditableWarning contentEditable>{selectedPost.title}</h2>
                                <PostEditor onChange={this.handleBodyChange.bind(this, selectedPost)}
                                            post={selectedPost}/>


                            </div>
                            : ''}
                    </Col>
                </Row>
                {this.state.dataToDelete &&
                <SimpleDialog open={this.state.confirmDeletionDialog} onClose={this.handleConfirmDeletion}
                              actions={[{key: 'yes', label: 'Yes'}, {key: 'no', label: 'No', type: 'primary'}]}
                              title="Confirm deletion">
                    Are you sure you want to delete the post &ldquo;{this.state.dataToDelete.title}&rdquo;?
                </SimpleDialog>
                }
            </BaseLayout>
        )
    }
}


PostContainer.propTypes = {
    /* routing params */
    match: PropTypes.object,
    history: PropTypes.object.isRequired,
    /* apollo client props */
    loading: PropTypes.bool,
    posts: PropTypes.array,
    createPost: PropTypes.func.isRequired,
    updatePost: PropTypes.func.isRequired,
    deletePost: PropTypes.func.isRequired
}

const POSTS_PER_PAGE = 100

const gqlQuery = gql`query{posts(limit: ${POSTS_PER_PAGE}){_id title body status createdBy{_id username}}}`
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
                            data.posts[idx] = updatePost
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
                            if (deletePost.status == 'deleting') {
                                console.log(data.posts[idx])
                                data.posts[idx].status = 'deleting'
                            } else {
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

