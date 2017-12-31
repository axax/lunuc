import React from 'react'
import PropTypes from 'prop-types'
import KeyValuePair from '../components/keyvalue/KeyValuePair'
import KeyValuePairAdder from '../components/keyvalue/KeyValuePairAdder'
import {graphql, compose} from 'react-apollo'
import gql from 'graphql-tag'
import {connect} from 'react-redux'


const KeyValueContainer = ({keyValues, loading, setKeyValue}) => {

	const handelValueChange = (key, e) => {
        setKeyValue({
			key: key,
			value: e.target.value
		}).then(({data}) => {
		}).catch((e) => {
			console.log(e)
		})
	}

	const handleAddNewKeyValue = ({key, value}) => {
        setKeyValue({
			key: key,
			value: value
		}).then(({data}) => {
		})
	}

	let pairs = []

	if (keyValues && keyValues.results) {
        keyValues.results.forEach(
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
    keyValues: PropTypes.object,
	loading: PropTypes.bool,
    setKeyValue: PropTypes.func.isRequired,
}

/**
 * GraphQL query with apollo client
 */

const gqlKeyValueQuery = gql`query{ 
  	keyValues{limit offset total results{key value status _id createdBy{_id username}} }
}`

const gqlKeyValueUpdate = gql`
  mutation KeyValueUpdate($key: String!, $value: String!) {
  	setKeyValue(key: $key, value: $value){
    	key value status _id createdBy{_id username}
  	}
  }`


const KeyValueContainerWithGql = compose(
	graphql(gqlKeyValueQuery, {
		options() {
			return {
				fetchPolicy: 'cache-and-network',
			}
		},
		props: ({data: {loading, keyValues}}) => ({
            keyValues,
			loading
		})
	}),
	graphql(gqlKeyValueUpdate, {
		props: ({ownProps, mutate}) => ({
            setKeyValue: ({key, value}) => {
				return mutate({
					variables: {key, value},
					optimisticResponse: {
						__typename: 'Mutation',
                        setKeyValue: {
                            _id: '#' + new Date().getTime(),
                            status: 'creating',
                            createdBy: {
                                _id: ownProps.user.userData._id,
                                username: ownProps.user.userData.username,
                                __typename: 'UserPublic'
                            },
							key,
							value,
							__typename: 'KeyValue'
						}
					},
                    update: (proxy, {data: {setKeyValue}}) => {
                        // Read the data from our cache for this query.
                        const data = proxy.readQuery({query: gqlKeyValueQuery})
                        // Add our note from the mutation to the end.
                        const idx = data.keyValues.results.findIndex(x => x.key === setKeyValue.key)
                        if (idx > -1) {
                            data.keyValues.results[idx].value = setKeyValue.value
                        } else {
                            data.keyValues.results.push(setKeyValue)
							data.keyValues.total++;
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
)(KeyValueContainerWithGql)

