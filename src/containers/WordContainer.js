import React from 'react'
import PropTypes from 'prop-types'
import {gql, graphql, compose} from 'react-apollo'
import {connect} from 'react-redux'
import AddNewWord from '../components/word/AddNewWord'
import update from 'immutability-helper'


class WordContainer extends React.Component {
    constructor(props) {
        super(props)
    }
	componentWillMount() {
	}

	handleAddWordClick = (data) => {
		const {createWord } = this.props
        createWord({
            en: data.en,
            de: data.de
        })
	}

	handleWordChange = (event,data,lang) => {

        const t=event.target.innerText
		if( t!= data[lang] ) {
            const {updateWord} = this.props
            updateWord(
                update(data, {[lang]: {$set: t}})
			)
        }
	}

    handleDeleteWordClick = (data) => {
        const {deleteWord} = this.props
        deleteWord({
            id: data._id
        })
    }

	render() {
		const { words, loading } = this.props

		console.log('render word', words)


		return (
			<div>
				<h1>Words</h1>
				<ul suppressContentEditableWarning={true}>
					{(words?words.slice(0).reverse().map((word, i) => {
                        return 	<li key={i}>
									<span onBlur={(e) => this.handleWordChange.bind(this)(e,word,'de')} suppressContentEditableWarning contentEditable>{word.de}</span>=
									<span onBlur={(e) => this.handleWordChange.bind(this)(e,word,'en')} suppressContentEditableWarning contentEditable>{word.en}</span> ({word.createdBy.username})
									<button disabled={(word.status=='deleting' || word.status=='updating')} onClick={this.handleDeleteWordClick.bind(this,word)}>X</button>
						</li>
					}):'')}
				</ul>
                <AddNewWord onClick={this.handleAddWordClick}/>
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
	createWord: PropTypes.func.isRequired,
	updateWord: PropTypes.func.isRequired,
	deleteWord: PropTypes.func.isRequired
}

const WORDS_PER_PAGE=10

const gqlQuery=gql`query{words(limit: ${WORDS_PER_PAGE}){_id de en status createdBy{_id username}}}`
const WordContainerWithGql = compose(
	graphql(gqlQuery, {
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
	graphql(gql`mutation createWord($en: String!, $de: String){createWord(en:$en,de:$de){_id en de createdBy{_id username} status}}`, {
		props: ({ownProps, mutate}) => ({
            createWord: ({en, de}) => {
				return mutate({
					variables: {en, de},
					optimisticResponse: {
						__typename: 'Mutation',
						// Optimistic message
                        createWord: {
							_id: '#' + new Date().getTime(),
							en,
							de,
							status: 'creating',
							createdBy: {
								_id: ownProps.user.userData._id,
								username: ownProps.user.userData.username,
								__typename: 'UserPublic'
							},
							__typename: 'Word'
						}
					},
					update: (store, {data: {createWord}}) => {
						console.log('createWord', createWord)
						// Read the data from the cache for this query.
						const data = store.readQuery({query: gqlQuery})

						data.words.push(createWord)
						store.writeQuery({query: gqlQuery, data})
					}
				})
			}
		}),
	}),
	graphql(gql`mutation updateWord($_id: ID!,$en: String, $de: String){updateWord(_id:$_id,en:$en,de:$de){_id en de createdBy{_id username} status}}`, {
		props: ({ownProps, mutate}) => ({
            updateWord: ({_id, en, de}) => {
				return mutate({
					variables: {_id, en, de},
					optimisticResponse: {
						__typename: 'Mutation',
						// Optimistic message
                        updateWord: {
							_id,
							en,
							de,
							status: 'updating',
							createdBy: {
								_id: ownProps.user.userData._id,
								username: ownProps.user.userData.username,
								__typename: 'UserPublic'
							},
							__typename: 'Word'
						}
					},
					update: (store, {data: {updateWord}}) => {
						console.log('updateWord', updateWord)
						// Read the data from the cache for this query.
						const data = store.readQuery({query: gqlQuery})
                        const idx = data.words.findIndex(x => x._id === updateWord._id)
                        if (idx > -1) {
							data.words[idx]=updateWord
                            store.writeQuery({query: gqlQuery, data})
                        }
					}
				})
			}
		}),
	}),
    graphql(gql`mutation deleteWord($id: ID!){deleteWord(id: $id){_id status}}`, {
        props: ({ownProps, mutate}) => ({
            deleteWord: ({id}) => {
                return mutate({
                    variables: {id},
                    optimisticResponse: {
                        __typename: 'Mutation',
                        deleteWord: {
                            _id: id,
                            status: 'deleting',
                            __typename: 'Word'
                        }
                    },
                    update: (store, {data: {deleteWord}}) => {
                        console.log('deleteWord', deleteWord)
                        // Read the data from the cache for this query.
                        const data = store.readQuery({query: gqlQuery})

                        const idx = data.words.findIndex((e) => e._id === deleteWord._id)
                        if (idx >= 0) {
                            if( deleteWord.status == 'deleting' ){
                                console.log(data.words[idx])
                                data.words[idx].status = 'deleting'
                            }else {
                                data.words.splice(idx, 1)
                            }
                            store.writeQuery({query: gqlQuery, data})
                        }

                    }
                })
            }
        })
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

