import React from 'react'
import PropTypes from 'prop-types'

export default class AddNewPost extends React.Component {
	constructor(props) {
		super(props)
		this.state = {title: '', body:''}
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
		this.props.onClick({title: this.state.title,body: this.state.body})
	}

	render() {
		return (
			<div>
				<input type="text" placeholder="Title" value={this.state.title} name="title"
							 onChange={this.handleInputChange}/>
				<button disabled={(this.state.title.trim()=='')} onClick={this.onAddClick}>Add post</button>
			</div>
		)
	}
}

AddNewPost.propTypes = {
	onClick: PropTypes.func
}