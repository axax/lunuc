import React from 'react'
import {connect} from 'react-redux'
import {bindActionCreators} from 'redux'
import * as Actions from '../actions/KeyValueAction'
import KeyValuePair from '../components/KeyValuePair'
import KeyValuePairAdder from '../components/KeyValuePairAdder'
import {gql, graphql, compose} from 'react-apollo'

const KeyValueContainer = ({localKeyvalue, actions, keyvalue, loading, setValue}) => {

	const handelValueChange = (key, e) => {
		/**
		 * Set a new value for a certain key
		 */
		/*actions.setKeyValue({
		 key: key,
		 value: e.target.value
		 })*/
		setValue({
				key: key,
				value: e.target.value
		}).then(({data}) => {
			//console.log('got data', data);
		})
	}

	const handleAddNewKeyValue = ({key, value}) => {
		actions.setKeyValue({
			key: key,
			value: value
		})
	}

	let pairs = []

	localKeyvalue.keySeq().forEach(
		(k) => pairs.push(<KeyValuePair key={k} keyvalue={{key: k, value: localKeyvalue.get(k)}}
																		onChange={handelValueChange.bind(this, k)}/>)
	)

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
	localKeyvalue: React.PropTypes.object.isRequired,
	actions: React.PropTypes.object.isRequired,

	/* apollo client props */
	keyvalue: React.PropTypes.array,
	loading: React.PropTypes.bool,
	setValue: React.PropTypes.func.isRequired,
}


/**
 * Map the state to props.
 */
const mapStateToProps = (state) => {
	const {keyvalue} = state
	return {
		localKeyvalue: keyvalue.get('pairs')
	}
}

/**
 * Map the actions to props.
 */
const mapDispatchToProps = (dispatch) => ({
	actions: bindActionCreators(Actions, dispatch)
})


/**
 * GraphQL query with apollo client
 */

const gqlKeyValueQuery = gql`
  query KeyValueQuery($key: String!) {
  	# return all keyvalue pairs
  	keyvalue {
  		id
			key
			value
		}
		# return a single value
    value(key: $key)
  }`

const gqlKeyValueUpdate = gql`
  mutation KeyValueUpdate($key: String!, $value: String!) {
  	setValue(key: $key, value: $value){
  		id
    	key
    	value
  	}
  }`


const KeyValueContainerWithGql = compose(
	graphql(gqlKeyValueQuery, {
		options: {
			variables: {
				key: 'key2'
			},
			forcePolicy: 'cache-first'
		},
		/*props: (d)=>{
		 console.log("xxx",d)
		 },*/
		props: ({data: {loading, keyvalue}}) => ({
			keyvalue,
			loading
		}),
	}),
	graphql(gqlKeyValueUpdate, {
		props: ({ownProps, mutate}) => ({
			setValue: ({key, value}) => {
				return mutate({
					variables: {key, value, id: key},
					optimisticResponse: {
						__typename: 'Mutation',
						setValue: {
							id: key, // id is only needed for apollo to identify the object (dataIdFromObject)
							key: key,
							value: value,
							__typename: 'keyvalue'
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
export default connect(
	mapStateToProps,
	mapDispatchToProps
)(KeyValueContainerWithGql)

