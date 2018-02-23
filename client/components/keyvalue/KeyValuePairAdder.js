import React from 'react'
import PropTypes from 'prop-types'
import {Row, Col, TextField, Button} from 'ui/admin'

/* Component with a state */
export default class KeyValuePairAdder extends React.Component {
	constructor(props) {
		super(props)
		this.state = {key: '', value: ''}
	}

	// arrow function work here thanks to bable preset stage-0
	onChangeValue = (e) => {
		this.setState({value: e.target.value})
	}

	onChangeKey = (e) => {
		this.setState({key: e.target.value})
	}

	onAddClick = () => {
		this.props.onClick({key: this.state.key, value: this.state.value})
        this.setState({key:'',value:''})
	}

	render() {
		return (
			<Row>
				<Col md={5}>
					<TextField type="text" value={this.state.key}
							 onChange={this.onChangeKey}/>
				</Col>
				<Col md={5}>
					<TextField type="text" value={this.state.value}
							 onChange={this.onChangeValue}/>
				</Col>
				<Col md={2}>
					<Button color="primary" variant="raised" onClick={this.onAddClick}>Add pair</Button>
				</Col>
			</Row>
		)
	}
}

KeyValuePairAdder.propTypes = {
	onClick: PropTypes.func
}