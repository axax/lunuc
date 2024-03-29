import React from 'react'
import PropTypes from 'prop-types'
import compose from 'util/compose'
import Util from 'client/util/index.mjs'
import GenericForm from 'client/components/GenericForm'
import {Row, Col, Typography, SimpleList, DeleteIconButton, SimpleDialog} from 'ui/admin'
import config from 'gen/config-client'
import {graphql} from '../../../client/middleware/graphql'

const {ADMIN_BASE_URL} = config
import Async from 'client/components/Async'
import {_t} from 'util/i18n.mjs'

const DEFAULT_RESULT_LIMIT = 10

const PostEditor = (props) => <Async {...props}
                                     load={import(/* webpackChunkName: "post" */ '../components/PostEditor')}/>

const DraftJsPostEditor = (props) => <Async {...props}
                                     load={import(/* webpackChunkName: "post" */ '../components/post/PostEditor')}/>


class PostContainer extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            confirmDeletionDialog: true,
            dataToDelete: null
        }

        this.filter = Util.extractQueryParams(window.location.search.substring(1)).f

    }

    handleAddPostClick = (post) => {
        const {createPost} = this.props
        createPost({body:'',editor:'lexical',...post}).then(() => {
            this.addPostForm.reset()
        })
    }

    handleAddPostValidate = (post) => {
        return {isValid: post.title.trim() !== ''}
    }


    saveBodyTimeouts = {}
    handleBodyChange = (post, data) => {
        clearTimeout(this.saveBodyTimeouts[post._id])
        this.saveBodyTimeouts[post._id] = setTimeout(() => {
            console.log('save post')

            const {updatePost} = this.props
            const finalData = data.constructor === String ? data : JSON.stringify(data)
            if(post.body !== finalData) {
                updatePost(
                    Object.assign({}, post, {body: finalData})
                )
            }

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

    handleChangePage = (page) => {
        this.goTo(null, page, this.props.posts.limit)
    }


    handleChangeRowsPerPage = (limit) => {
        this.goTo(null, 1, limit)
    }

    handleFilterChange = (e) => {
        this.filter = e.target.value
        this.goTo(null, 1, this.props.posts.limit, this.filter)
    }

    goTo(id, page, limit, filter) {
        this.props.history.push(`${ADMIN_BASE_URL}/post${(id ? '/' + id : '')}?p=${page}&l=${limit}${filter ? '&f=' + filter : ''}`)
    }

    render() {
        const {posts, match, history} = this.props
        const selectedPostId = match.params.id

        if (!posts)
            return null

        let selectedPost = false
        const listItems = (posts.results ? posts.results.reduce((a, post) => {
            if (post._id === selectedPostId) {
                selectedPost = post
            }
            a.push({
                selected: post._id === selectedPostId,
                primary: post.title,
                onClick: () => {
                    this.goTo(post._id, 1+Math.ceil(posts.offset/posts.limit), posts.limit, this.filter)
                },
                secondary: Util.formattedDatetimeFromObjectId(post._id),
                actions: <DeleteIconButton onClick={this.handlePostDeleteClick.bind(this, post)}/>,
                disabled: ['creating', 'deleting'].indexOf(post.status) > -1
            })
            return a
        }, []) : [])


        return <>
                <Typography variant="h3" gutterBottom>Posts</Typography>
                <Row spacing={3}>
                    <Col md={4}>
                        <SimpleList items={listItems}
                                    filter={this.filter}
                                    rowsPerPage={posts.limit}
                                    onFilterChange={this.handleFilterChange.bind(this)}
                                    onChangePage={this.handleChangePage.bind(this)}
                                    onChangeRowsPerPage={this.handleChangeRowsPerPage.bind(this)}
                                    count={posts.total}
                                    page={posts.offset/posts.limit+1}/>

                        <GenericForm onRef={(e) => {
                            this.addPostForm = e
                        }} fields={{title: {value: '', placeholder: _t('Post.enterTitle'),label:'Title'}}}
                                     caption={_t('Post.addPost')}
                                     style={{marginTop:'2rem'}}
                                     onValidate={this.handleAddPostValidate} onClick={this.handleAddPostClick}/>

                    </Col>
                    <Col md={8}>
                        {selectedPost ?
                            <div>
                                <h2 onBlur={(e) => this.handleTitleChange.bind(this)(e, selectedPost)}
                                    suppressContentEditableWarning contentEditable>{selectedPost.title}</h2>

                                {selectedPost.editor==='lexical' &&
                                <PostEditor onChange={this.handleBodyChange.bind(this, selectedPost)}
                                            post={selectedPost}/>}

                                {(!selectedPost.editor || selectedPost.editor==='darftjs') &&
                                <DraftJsPostEditor onChange={this.handleBodyChange.bind(this, selectedPost)} imageUpload={true}
                                            post={selectedPost}/>}


                                <small>Post ID: {selectedPostId}</small>
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
            </>
    }
}


PostContainer.propTypes = {
    /* routing params */
    match: PropTypes.object,
    history: PropTypes.object.isRequired,
    loading: PropTypes.bool,
    posts: PropTypes.object,
    createPost: PropTypes.func.isRequired,
    updatePost: PropTypes.func.isRequired,
    deletePost: PropTypes.func.isRequired
}


const getVariables = () => {
    const {p, l, f} = Util.extractQueryParams(window.location.search.substring(1))

    return {
        limit: l ? parseInt(l) : DEFAULT_RESULT_LIMIT,
        page: p ? parseInt(p) : 1,
        query: f || ''
    }
}

const gqlQuery = `query posts($limit: Int, $page: Int, $query: String){posts(limit: $limit, page: $page, query: $query){limit offset total results{_id title body editor status createdBy{_id username}}}}`
const PostContainerWithGql = compose(
    graphql(gqlQuery, {
        options() {
            return {
                fetchPolicy: 'cache-and-network',
                variables: getVariables()
            }
        },
        props: ({data: {loading, posts}}) => ({
            posts,
            loading
        })
    }),
    graphql(`mutation createPost($title: String!, $body: String, $editor: String){createPost(title:$title,body:$body,editor:$editor){_id title body createdBy{_id username} status}}`, {
        props: ({ownProps, mutate}) => ({
            createPost: ({title, body, editor}) => {
                return mutate({
                    variables: {title, body, editor},
                    optimisticResponse: {
                        __typename: 'Mutation',
                        // Optimistic message
                        createPost: {
                            _id: '#' + new Date().getTime(),
                            body,
                            title,
                            editor,
                            status: 'creating',
                            createdBy: {
                                _id: _app_.user._id,
                                username: _app_.user.username,
                                __typename: 'UserPublic'
                            },
                            __typename: 'Post'
                        }
                    },
                    update: (store, {data: {createPost}}) => {
                        const variables = getVariables()
                        //console.log('createPost', createPost)
                        // Read the data from the cache for this query.
                        const storeData = store.readQuery({query: gqlQuery, variables})

                        const newData = {...storeData.posts}
                        if (!newData.results) {
                            newData.results = []
                        } else {
                            newData.results = [...newData.results]
                        }

                        newData.results.push(createPost)
                        store.writeQuery({query: gqlQuery, variables, data: {...storeData, posts: newData}})
                    }
                })
            }
        }),
    }),
    graphql(`mutation updatePost($_id: ID!,$body: String, $title: String){updatePost(_id:$_id,body:$body,title:$title){_id body title createdBy{_id username} status}}`, {
        props: ({ownProps, mutate}) => ({
            updatePost: ({_id, body, editor, title}) => {
                return mutate({
                    variables: {_id, body, title},
                    optimisticResponse: {
                        __typename: 'Mutation',
                        // Optimistic message
                        updatePost: {
                            _id,
                            body,
                            title,
                            editor,
                            status: 'updating',
                            createdBy: {
                                _id: _app_.user._id,
                                username: _app_.user.username,
                                __typename: 'UserPublic'
                            },
                            __typename: 'Post'
                        }
                    },
                    update: (store, {data: {updatePost}}) => {
                        const variables = getVariables()

                        //console.log('updatePost', updatePost)
                        // Read the data from the cache for this query.
                        const storeData = store.readQuery({query: gqlQuery, variables})
                        const idx = storeData.posts.results.findIndex(x => x._id === updatePost._id)
                        if (idx > -1) {
                            const newData = {...storeData.posts}
                            if (!newData.results) {
                                newData.results = []
                            } else {
                                newData.results = [...newData.results]
                            }

                            newData.results[idx] = updatePost
                            store.writeQuery({query: gqlQuery, variables, data: {...storeData, posts: newData}})
                        }
                    }
                })
            }
        }),
    }),
    graphql(`mutation deletePost($_id: ID!){deletePost(_id: $_id){_id status}}`, {
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
                        const variables = getVariables()

                        console.log('deletePost', deletePost)
                        // Read the data from the cache for this query.
                        const storeData = store.readQuery({query: gqlQuery, variables})

                        const idx = storeData.posts.results.findIndex((e) => e._id === deletePost._id)
                        if (idx >= 0) {
                            const newData = {...storeData.posts}
                            if (!newData.results) {
                                newData.results = []
                            } else {
                                newData.results = [...newData.results]
                            }

                            if (deletePost.status == 'deleting') {
                                console.log(storeData.posts[idx])
                                newData[idx] = {...newData[idx], status: 'deleting'}
                            } else {
                                newData.results.splice(idx, 1)
                            }
                            store.writeQuery({query: gqlQuery, variables, data: {...storeData, posts: newData}})
                        }

                    }
                })
            }
        })
    })
)(PostContainer)


export default PostContainerWithGql

