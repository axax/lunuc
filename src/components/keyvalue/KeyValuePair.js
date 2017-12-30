import React from 'react'
import PropTypes from 'prop-types'
import {Row, Col, Input} from '../ui'

const KeyValuePair = ({keyvalue, onChange}) => {
	return <Row spacing={10} style={{marginBottom: 10}}>
		<Col md={6}>
			<Input size type="text" readOnly value={keyvalue.key}/>
		</Col>
		<Col md={6}>
			<Input size type="text" value={keyvalue.value}
					 onChange={onChange}/>
		</Col>
	</Row>
}

KeyValuePair.propTypes = {
	keyvalue: PropTypes.object.isRequired,
	onChange: PropTypes.func
}

export default KeyValuePair