import React from 'react'
import PropTypes from 'prop-types'

export default class GenericForm extends React.Component {
	constructor(props) {
		super(props)

        this.state = this.getInitalState()
	}

	getInitalState = () => {
        const initalState = {}
        Object.keys(this.props.fields).map((k) => {
            initalState[k] = this.props.fields[k].value || ''
        })
        return initalState
	}

	reset = () => {
		this.setState(this.getInitalState())
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
		this.props.onClick(this.state)
		//this.setState({en: '', de: ''})
	}

	render() {

		return (
			<div>
				{
                    Object.keys(this.props.fields).map((k) => {
                    	const o = this.props.fields[k]
						const type = o.type || 'text'
                    	if( type=== 'text'){
                    		return <input key={k} type={type} placeholder={o.placeholder} value={this.state[k]} name={k}
										  onChange={this.handleInputChange}/>
						}
                    })
				}
				<button disabled={false} onClick={this.onAddClick}>{this.props.caption || 'Add'}</button>
			</div>
		)
	}
}

GenericForm.propTypes = {
    fields: PropTypes.object,
	onClick: PropTypes.func,
	caption: PropTypes.string
}