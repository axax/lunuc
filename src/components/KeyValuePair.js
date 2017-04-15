import React from 'react'
import PropTypes from 'prop-types'

const KeyValuePair = ({keyvalue, onChange}) => {
	return <div>
		<input type="text" readOnly value={keyvalue.key}/>
		<input type="text" value={keyvalue.value}
					 onChange={onChange}/>
	</div>
}

KeyValuePair.propTypes = {
	keyvalue: PropTypes.object.isRequired,
	onChange: PropTypes.func
}

export default KeyValuePair