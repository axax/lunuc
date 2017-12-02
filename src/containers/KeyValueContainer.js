import React from 'react'
import PropTypes from 'prop-types'
import KeyValuePair from '../components/keyvalue/KeyValuePair'
import KeyValuePairAdder from '../components/keyvalue/KeyValuePairAdder'
import {graphql, compose} from 'react-apollo'
import gql from 'graphql-tag'
import update from 'immutability-helper'


const KeyValueContainer = ({keyvalue, loading, setValue}) => {

	const handelValueChange = (key, e) => {
		setValue({
			key: key,
			value: e.target.value
		}).then(({data}) => {
		}).catch((e) => {
			console.log(e)
		})
	}

	const handleAddNewKeyValue = ({key, value}) => {
		setValue({
			key: key,
			value: value
		}).then(({data}) => {
		})
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
  query{keyvalue {
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
					},
                    update: (proxy, {data: {setValue}}) => {
                        // Read the data from our cache for this query.
                        const data = proxy.readQuery({query: gqlKeyValueQuery})
                        // Add our note from the mutation to the end.
                        const idx = data.keyvalue.findIndex(x => x.key === setValue.key)
                        if (idx > -1) {
                            data.keyvalue[idx].value = setValue.value
                        } else {
                            data.keyvalue.push(setValue)
                        }
                        // Write our data back to the cache.
                        proxy.writeQuery({query: gqlKeyValueQuery, data})
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

