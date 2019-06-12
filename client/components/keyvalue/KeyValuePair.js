import React from 'react'
import PropTypes from 'prop-types'
import {Row, Col, TextField, Button} from 'ui/admin'

const KeyValuePair = ({keyvalue, onChange, onDelete}) => {
	return <Row spacing={1} style={{marginBottom: 8}}>
		<Col md={5}>
			<TextField type="text" readOnly value={keyvalue.key}/>
		</Col>
		<Col md={5}>
			<TextField type="text" value={keyvalue.value}
					 onChange={onChange}/>
		</Col>
		<Col md={2}>
			<Button variant="contained"
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
