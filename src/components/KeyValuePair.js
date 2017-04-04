import React from 'react'

const KeyValuePair = ({keyvalue, onChange}) => {
	return <div>
		<input type="text" readOnly value={keyvalue.key}/>
		<input type="text" value={keyvalue.value}
					 onChange={onChange}/>
	</div>
}

KeyValuePair.propTypes = {
	keyvalue: React.PropTypes.object.isRequired,
	onChange: React.PropTypes.func
}

export default KeyValuePair