import React from 'react'
import PropTypes from 'prop-types'
import KeyValuePair from '../components/keyvalue/KeyValuePair'
import KeyValuePairAdder from '../components/keyvalue/KeyValuePairAdder'
import {gql, graphql, compose} from 'react-apollo'
import update from 'immutability-helper'


const KeyValueContainer = ({keyvalue, loading, setValue}) => {

	const handelValueChange = (key, e) => {
		setValue({
			key: key,
			value: e.target.value
		}).then(({data}) => {}).catch((e) => {
			console.log(e)
		})
	}

	const handleAddNewKeyValue = ({key, value}) => {
		setValue({
			key: key,
			value: value
		}).then(({data}) => {})
	}

	let pairs = []

	if (keyvalue) {
		keyvalue.forEach(
			(o) => pairs.push(<KeyValuePair key={o.key} keyvalue={{key: o.key, value: o.value}}
																			onChange={handelValueChange.bind(this, o.key)}/>)
		)
	}
	return <div>
		{loading ? <span>loading...</span> : ''}
		{pairs}
		<hr />
		<KeyValuePairAdder onClick={handleAddNewKeyValue}/>
	</div>
}


KeyValueContainer.propTypes = {
	/* apollo client props */
	keyvalue: PropTypes.array,
	loading: PropTypes.bool,
	setValue: PropTypes.func.isRequired,
}

/**
 * GraphQL query with apollo client
 */

const gqlKeyValueQuery = gql`
  query KeyValueQuery($key: String!) {
  	# return all keyvalue pairs
  	keyvalue {
			key
			value
		}
		# return a single value
    keyvalueOne(key: $key) {
    	key
    	value
    }
  }`

const gqlKeyValueUpdate = gql`
  mutation KeyValueUpdate($key: String!, $value: String!) {
  	setValue(key: $key, value: $value){
    	key
    	value
  	}
  }`


const KeyValueContainerWithGql = compose(
	graphql(gqlKeyValueQuery, {
		options() {
			return {
				fetchPolicy: 'cache-and-network',
				variables: {
					key: 'key2'
				},
				reducer: (prev, {operationName, type, result: {data}}) => {

					if (type === 'APOLLO_MUTATION_RESULT' && operationName === 'KeyValueUpdate' && data && data.setValue && data.setValue.key ) {

						let found=prev.keyvalue.find(x => x.key === data.setValue.key )
						if( !found ) {
							return update(prev, {keyvalue: {$push: [data.setValue]}})
						}
					}
					return prev
				}
			}
		},

		props: ({data: {loading, keyvalue}}) => ({
			keyvalue,
			loading
		})

	}),
	graphql(gqlKeyValueUpdate, {
		props: ({ownProps, mutate}) => ({
			setValue: ({key, value}) => {
				return mutate({
					variables: {key, value},
					optimisticResponse: {
						__typename: 'Mutation',
						setValue: {
							key: key,
							value: value,
							__typename: 'KeyValue'
						}
					}
				})
			}
		})
	})
)(KeyValueContainer)


/**
 * Connect the component to
 * the Redux store.
 */
export default KeyValueContainerWithGql

