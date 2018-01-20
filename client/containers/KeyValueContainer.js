import React from 'react'
import KeyValuePair from 'client/components/keyvalue/KeyValuePair'
import KeyValuePairAdder from 'client/components/keyvalue/KeyValuePairAdder'
import {withKeyValues} from './generic/withKeyValues'
import PropTypes from 'prop-types'


const KeyValueContainer = ({keyValues, loading, setKeyValue, deleteKeyValue}) => {

	const handelValueChange = (key, e) => {
        setKeyValue({
			key: key,
			value: e.target.value
		}).then(({data}) => {
		}).catch((e) => {
			console.log(e)
		})
	}

	const handelDeletion = (key) => {
        deleteKeyValue({key}).then(({data}) => {
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
											onDelete={handelDeletion.bind(this, o.key)}
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
    loading: PropTypes.bool,
    keyValues: PropTypes.object,
    keyValueMap: PropTypes.object,
    setKeyValue: PropTypes.func.isRequired,
    deleteKeyValue: PropTypes.func.isRequired
}


export default withKeyValues(KeyValueContainer)

