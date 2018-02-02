import React from 'react'
import PropTypes from 'prop-types'
import {Button, TextField} from 'ui/admin'
import FileDrop from '../FileDrop'
import TypePicker from '../TypePicker'

class GenericForm extends React.Component {
    constructor(props) {
        super(props)
        this.state = this.getInitalState(props)
    }

    shouldComponentUpdate(props, state) {
        return props.fields !== this.props.fields || state !== this.state
    }

    componentWillReceiveProps(props) {
        if (props.fields !== this.props.fields) {
            this.setState(this.getInitalState(props))
        }
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

    getInitalState = (props) => {
        const initalState = {fields: {}, isValid: true}
        Object.keys(props.fields).map((k) => {
            initalState.fields[k] = props.fields[k].value===undefined?null:props.fields[k].value
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
            const newState = Object.assign({}, {fields: {}}, prevState)
            newState.fields[name] = value
            if (this.props.onChange) {
                this.props.onChange({name, value})
            }
            newState.isValid = this.validate(newState)
            return newState
        })
    }


    onAddClick = () => {
        if (this.props.onClick)
            this.props.onClick(this.state.fields)
        this.setState(this.getInitalState(this.props))
    }

    render() {
        return (
            <form>
                {
                    Object.keys(this.props.fields).map((k) => {
                        const o = this.props.fields[k],
                        value = this.state.fields[k]
                        const uitype = o.uitype || 'text'
                        if (uitype === 'image') {
                            return <FileDrop key={k}/>
                        } else if (uitype === 'type_picker') {
                            return <TypePicker value={value} onChange={this.handleInputChange} key={k}
                                               name={k}
                                               multi={o.multi}
                                               type={o.type} placeholder={o.placeholder}/>
                        } else if (uitype === 'select') {

                            //TODO: implement
                        } else {
                            return <TextField key={k} fullWidth={o.fullWidth} type={uitype} placeholder={o.placeholder}
                                              value={value || ''}
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
    fields: PropTypes.object.isRequired,
    onClick: PropTypes.func,
    onValidate: PropTypes.func,
    caption: PropTypes.string,
    primaryButton: PropTypes.bool
}

export default GenericForm