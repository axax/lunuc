import React from 'react'
import PropTypes from 'prop-types'
import update from 'immutability-helper'
import {Button, Input} from '../ui'

export default class GenericForm extends React.Component {
	constructor(props) {
		super(props)

        this.state = this.getInitalState()
	}

    componentDidMount(){
        this.validate(this.state)
    }

	validate(state){
        if( this.props.onValidate ){
            this.setState({isValid:this.props.onValidate(state.fields)})
        }
	}

	getInitalState = () => {
        const initalState = {fields:{},isValid:true}
        Object.keys(this.props.fields).map((k) => {
            initalState.fields[k] = this.props.fields[k].value || ''
        })
        return initalState
	}

	reset = () => {
		this.setState(this.getInitalState())
        this.validate(this.state)
    }


    handleInputChange = (e) => {
        const target = e.target
        const value = target.type === 'checkbox' ? target.checked : target.value
        const name = target.name

        this.setState((prevState) => {
			const newState = update(prevState, {fields: {[target.name]: {$set:value}}})
            this.validate(newState)
            return newState
        })
    }


	onAddClick = () => {
		this.props.onClick(this.state.fields)
	}

	render() {

		return (
			<div>
				{
                    Object.keys(this.props.fields).map((k) => {
                    	const o = this.props.fields[k]
						const type = o.type || 'text'
                    	if( type=== 'select') {
							//TODO: implement
                        }else{
                    		return <Input key={k} type={type} placeholder={o.placeholder} value={this.state.fields[k]} name={k}
										  onChange={this.handleInputChange}/>
						}
                    })
				}
				<Button type="primary" raised disabled={!this.state.isValid} onClick={this.onAddClick}>{this.props.caption || 'Add'}</Button>
			</div>
		)
	}
}

GenericForm.propTypes = {
    fields: PropTypes.object,
	onClick: PropTypes.func,
    onValidate: PropTypes.func,
	caption: PropTypes.string
}