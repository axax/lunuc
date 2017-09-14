import React from 'react'
import PropTypes from 'prop-types'
import {gql, graphql, compose} from 'react-apollo'
import {Link} from 'react-router-dom'
import ChatMessage from '../components/chat/ChatMessage'
import CreateChat from '../components/chat/CreateChat'
import AddChatUser from '../components/chat/AddChatUser'
import AddChatMessage from '../components/chat/AddChatMessage'
import update from 'immutability-helper'
import {connect} from 'react-redux'
import Util from '../util'


class WordContainer extends React.Component {

	componentWillMount() {
	}

	handleAddWordClick = (data) => {
		const {createWord } = this.props

        createMessage({
            en: data.en,
            de: data.de
        })
	}

	render() {
		const { words, loading } = this.props

		console.log('render word', words)


		return (
			<div>
				<h1>Words</h1>
				<ul>
					{(words?words.slice(0).reverse().map((word, i) => {
						return <li key={i}>{word.de}={word.en} ({word.createdBy.username})</li>
					}):'')}
				</ul>
			</div>
		)
	}
}


WordContainer.propTypes = {
	/* routing params */
	match: PropTypes.object,
	/* apollo client props */
	loading: PropTypes.bool,
	words: PropTypes.array,
	createWord: PropTypes.func.isRequired
}

const WORDS_PER_PAGE=10


const WordContainerWithGql = compose(
	graphql(gql`query{words(limit: ${WORDS_PER_PAGE}){_id de en  createdBy{_id username}}}`, {
		options() {
			return {
				fetchPolicy: 'cache-and-network',
				reducer: (prev, {operationName, type, result: {data}}) => {
					if (type === 'APOLLO_MUTATION_RESULT') {
						/*if (operationName === 'createMessage' && data && data.createMessage && data.createMessage._id) {
							return createMessage(prev, data.createMessage)
						}*/
					}
					return prev
				}
			}
		},
        props: ({data: {loading, words}}) => ({
            words,
            loading
        })
	}),
	graphql(gql`mutation createWord($en: String!, $de: String){createWord(en:$en,de:$de){_id en de}}`, {
		props: ({ownProps, mutate}) => ({
            createWord: ({name}) => {
				return mutate({
					variables: {name},
					optimisticResponse: {
						__typename: 'Mutation',
						// Optimistic message
                        createWord: {
							_id: '#' + new Date().getTime(),
							name,
							status: 'creating',
							messages: [],
							createdBy: {
								_id: ownProps.user.userData._id,
								username: ownProps.user.userData.username,
								__typename: 'UserPublic'
							},
							users: [
								{
									_id: ownProps.user.userData._id,
									username: ownProps.user.userData.username,
									__typename: 'UserPublic'
								}
							],
							__typename: 'Chat'
						}
					},
					update: (store, {data: {createChat}}) => {
						/*console.log('createChat', createChat)
						// Read the data from the cache for this query.
						const data = store.readQuery({query: gqlQuery})

						data.chatsWithMessages.push(createChat)
						store.writeQuery({query: gqlQuery, data})*/
					}
				})
			}
		}),
	})
)(WordContainer)


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
)(WordContainerWithGql)

