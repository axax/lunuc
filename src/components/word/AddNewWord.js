import React from 'react'
import PropTypes from 'prop-types'

export default class AddNewWord extends React.Component {
	constructor(props) {
		super(props)
		this.state = {en: '', de: ''}
	}

    handleInputChange = (e) => {
        const target = e.target
        const value = target.type === 'checkbox' ? target.checked : target.value
        const name = target.name

        this.setState({
            [target.name]: value
        })
    }


	onAddClick = () => {
		this.props.onClick({en: this.state.en, de: this.state.de})
	}

	render() {
		return (
			<div>
				<input type="text" placeholder="English" value={this.state.en} name="en"
							 onChange={this.handleInputChange}/>
				<input type="text" placeholder="German" value={this.state.de} name="de"
							 onChange={this.handleInputChange}/>
				<button disabled={(this.state.en.trim()=='' || this.state.de.trim()=='')} onClick={this.onAddClick}>Add word</button>
			</div>
		)
	}
}

AddNewWord.propTypes = {
	onClick: PropTypes.func
}