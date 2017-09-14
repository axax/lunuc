import React from 'react'
import PropTypes from 'prop-types'

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
	}

	render() {
		return (
			<div>
				<input type="text" value={this.state.key}
							 onChange={this.onChangeKey}/>
				<input type="text" value={this.state.value}
							 onChange={this.onChangeValue}/>
				<button onClick={this.onAddClick}>Add pair</button>
			</div>
		)
	}
}

KeyValuePairAdder.propTypes = {
	onClick: PropTypes.func
}