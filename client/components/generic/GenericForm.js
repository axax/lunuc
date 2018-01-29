import React from 'react'
import PropTypes from 'prop-types'
import {Button, TextField} from 'ui/admin'
import FileDrop from '../FileDrop'

export default class GenericForm extends React.Component {
    constructor(props) {
        super(props)

        this.state = this.getInitalState()
    }

    componentDidMount() {
        this.setValidateState(this.state)
    }

    setValidateState(state) {
        if (this.props.onValidate) {
            this.setState({isValid: this.validate(state)})
        }
    }

    validate(state) {
        if (this.props.onValidate) {
            return this.props.onValidate(state.fields)
        }
        return true
    }

    getInitalState = () => {
        const initalState = {fields: {}, isValid: true}
        Object.keys(this.props.fields).map((k) => {
            initalState.fields[k] = this.props.fields[k].value || ''
        })
        return initalState
    }

    reset = () => {
        this.setState(this.getInitalState())
        this.setValidateState(this.state)
    }


    handleInputChange = (e) => {
        const target = e.target
        const value = target.type === 'checkbox' ? target.checked : target.value
        const name = target.name

        this.setState((prevState) => {
            const newState = Object.assign({},{fields:{}},prevState)
            newState.fields[name] = value

            if( this.props.onChange){
                this.props.onChange({name,value})
            }
            newState.isValid = this.validate(newState)
            return newState
        })
    }


    onAddClick = () => {
        this.props.onClick(this.state.fields)
    }

    render() {

        return (
            <form>
                {
                    Object.keys(this.props.fields).map((k) => {
                        const o = this.props.fields[k]
                        const type = o.type || 'text'

                        if( type === 'image'){
                            return <FileDrop key={k}  />
                        }else if (type === 'select') {

                            //TODO: implement
                        } else {
                            return <TextField key={k} fullWidth={o.fullWidth} type={type} placeholder={o.placeholder} value={this.state.fields[k]}
                                          name={k}
                                          onChange={this.handleInputChange}/>
                        }
                    })
                }
                {this.props.primaryButton != false ?
                    <Button color="primary" raised disabled={!this.state.isValid}
                            onClick={this.onAddClick}>{this.props.caption || 'Add'}</Button>
                    : ''}
            </form>
        )
    }
}

GenericForm.propTypes = {
    fields: PropTypes.object,
    onClick: PropTypes.func,
    onValidate: PropTypes.func,
    caption: PropTypes.string,
    primaryButton: PropTypes.bool
}