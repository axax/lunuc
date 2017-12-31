import React from 'react'
import PropTypes from 'prop-types'
import {Row, Col, Input, Button} from '../ui'

const KeyValuePair = ({keyvalue, onChange, onDelete}) => {
	return <Row spacing={8} style={{marginBottom: 8}}>
		<Col md={5}>
			<Input type="text" readOnly value={keyvalue.key}/>
		</Col>
		<Col md={5}>
			<Input type="text" value={keyvalue.value}
					 onChange={onChange}/>
		</Col>
		<Col md={2}>
			<Button raised
				onClick={onDelete}>Delete</Button>
		</Col>
	</Row>
}

KeyValuePair.propTypes = {
	keyvalue: PropTypes.object.isRequired,
	onChange: PropTypes.func,
	onDelete: PropTypes.func,
}

export default KeyValuePair