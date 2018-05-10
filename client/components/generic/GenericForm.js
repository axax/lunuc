import React from 'react'
import PropTypes from 'prop-types'
import {Button, TextField, SimpleSwitch} from 'ui/admin'
import FileDrop from '../FileDrop'
import TypePicker from '../TypePicker'
import config from 'gen/config'
import _t from 'util/i18n'

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
        let theState

        if( state ){
            theState = state
        }else{
            theState = this.state
        }

        const {fields,onValidate} = this.props

        let basicValidation = true
        const fieldErrors = {}
        Object.keys(fields).forEach(k=>{
            const field = fields[k]
            if( field.required ){
                if( !theState.fields[k] || theState.fields[k].trim()==='' ){
                    fieldErrors[k] = _t('GenericForm.validation.required')
                    basicValidation = false
                }
            }
        })

        if( !basicValidation ){
            this.setState({fieldErrors})

            return false
        }

        if (onValidate) {
            return onValidate(theState.fields)
        }
        return true
    }

    getInitalState = (props) => {
        const initalState = {fields: {}, fieldErrors:{}, isValid: true}
        Object.keys(props.fields).map(k => {
            const item = props.fields[k]
            let v
            if (props.values) {
                v = props.values[k]
            } else {
                // value must be null instead of undefined
                v = item.value === undefined ? null : item.value
            }
            initalState.fields[k] = v
            if (item.localized) {
                v = props.values ? props.values[k + '_localized'] : null
                initalState.fields[k + '_localized'] = v ? Object.assign({}, v) : null
            }
        })
        return initalState
    }

    reset = () => {
        this.setState(this.getInitalState(this.props))
        this.setValidateState(this.state)
    }


    handleInputChange = (e) => {
        const target = e.target
        const value = target.type === 'checkbox' ? target.checked : target.value
        const name = target.name
        this.setState((prevState) => {
            const newState = Object.assign({}, {fields: {}}, prevState)
            const path = name.split('.')
            if (path.length == 2) {
                if (!newState.fields[path[0]]) {
                    newState.fields[path[0]] = {}
                }
                newState.fields[path[0]][path[1]] = value
            } else {
                newState.fields[name] = value
            }
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
        const {fields, onKeyDown, primaryButton, caption} = this.props
        return (
            <form>
                {
                    Object.keys(fields).map((k) => {
                        const o = fields[k],
                            value = this.state.fields[k]

                        const uitype = o.uitype || 'text'


                        if (uitype === 'image') {
                            return <FileDrop key={k}/>
                        } else if (uitype === 'type_picker') {
                            return <TypePicker value={(value ? (value.constructor === Array ? value : [value]) : null)}
                                               onChange={this.handleInputChange} key={k}
                                               name={k}
                                               label={o.label}
                                               multi={o.multi}
                                               type={o.type} placeholder={o.placeholder}/>
                        } else if (uitype === 'select') {

                            //TODO: implement
                        } else if (o.type === 'Boolean') {

                            return <SimpleSwitch key={k} label={o.placeholder} name={k}
                                                 onChange={this.handleInputChange} checked={value ? true : false}/>

                        } else {
                            if (o.localized) {

                                return config.LANGUAGES.reduce((a, l) => {
                                    const valueLocalized = this.state.fields[k + '_localized']
                                    const fieldName = k + '_localized.' + l
                                    a.push(<TextField key={fieldName}
                                                      error={!!this.state.fieldErrors[fieldName]}
                                                      label={o.label}
                                                      fullWidth={o.fullWidth}
                                                      type={uitype}
                                                      placeholder={o.placeholder + ' [' + l + ']'}
                                                      value={(valueLocalized && valueLocalized[l] ? valueLocalized[l] : '')}
                                                      name={fieldName}
                                                      onKeyDown={(e) => {
                                                          onKeyDown && onKeyDown(e, valueLocalized[l])
                                                      }}
                                                      onChange={this.handleInputChange}/>)
                                    return a
                                }, [])
                            } else {
                                return <TextField error={!!this.state.fieldErrors[k]} key={k}
                                                  label={o.label}
                                                  fullWidth={o.fullWidth}
                                                  type={uitype}
                                                  placeholder={o.placeholder}
                                                  value={value || ''}
                                                  name={k}
                                                  onKeyDown={(e) => {
                                                      onKeyDown && onKeyDown(e, value)
                                                  }}
                                                  onChange={this.handleInputChange}/>
                            }

                        }
                    })
                }
                {primaryButton != false ?
                    <Button color="primary" variant="raised" disabled={!this.state.isValid}
                            onClick={this.onAddClick}>{caption || 'Add'}</Button>
                    : ''}
            </form>
        )
    }
}

GenericForm.propTypes = {
    fields: PropTypes.object.isRequired,
    values: PropTypes.object,
    onClick: PropTypes.func,
    onKeyDown: PropTypes.func,
    onValidate: PropTypes.func,
    caption: PropTypes.string,
    primaryButton: PropTypes.bool
}

export default GenericForm