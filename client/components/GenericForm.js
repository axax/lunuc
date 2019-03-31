import React from 'react'
import PropTypes from 'prop-types'
import {Button, TextField, SimpleSwitch, SimpleSelect} from 'ui/admin'
import FileDrop from './FileDrop'
import TypePicker from './TypePicker'
import config from 'gen/config'
import _t from 'util/i18n'
import ContentEditable from './ContentEditable'
import {withStyles} from 'ui/admin'


const styles = theme => ({
    editor: {
        border: '1px solid ' + theme.palette.grey['200'],
        padding: theme.spacing.unit,
        margin: theme.spacing.unit * 3 + 'px 0',
        maxHeight: 200,
        overflow: 'auto'
    }
})


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

        if (state) {
            theState = state
        } else {
            theState = this.state
        }

        const {fields, onValidate} = this.props

        const fieldErrors = {}
        Object.keys(fields).forEach(k => {
            const field = fields[k]
            if (field.required) {

                if (field.reference) {
                    let fieldValue = theState.fields[k]
                    if (fieldValue && fieldValue.length) {
                        fieldValue = fieldValue[0]
                    }
                    if (!fieldValue || !fieldValue._id) {
                        fieldErrors[k] = _t('GenericForm.validation.required')
                    }
                } else {
                    if (field.localized) {
                        config.LANGUAGES.forEach(lang => {
                            if (!theState.fields[k] || !theState.fields[k][lang] || !theState.fields[k][lang].trim() === '') {
                                fieldErrors[k + '.' + lang] = _t('GenericForm.validation.required')
                            }
                        })
                    } else {
                        if (!theState.fields[k] || theState.fields[k].trim() === '') {
                            fieldErrors[k] = _t('GenericForm.validation.required')
                        }
                    }
                }
            }
        })
        if (Object.keys(fieldErrors).length || Object.keys(this.state.fieldErrors).length) {
            this.setState({fieldErrors})
        }

        if (Object.keys(fieldErrors).length) {
            return false
        }

        if (onValidate) {
            return onValidate(theState.fields)
        }
        return true
    }

    getInitalState = (props) => {
        const initalState = {fields: {}, fieldErrors: {}, isValid: true}
        Object.keys(props.fields).map(k => {
            const item = props.fields[k]
            let fieldValue
            if (item.localized) {
                fieldValue = props.values && props.values[k] ? Object.assign({}, props.values[k]) : null
            } else {
                if (props.values) {
                    fieldValue = props.values[k]
                } else {
                    // value must be null instead of undefined
                    fieldValue = item.value === undefined ? null : item.value
                }
            }
            initalState.fields[k] = fieldValue
        })
        return initalState
    }

    reset = () => {
        this.setState(this.getInitalState(this.props))
        this.setValidateState(this.state)
    }


    handleInputChange = (e) => {

        const {fields} = this.props

        const target = e.target
        let value = target.type === 'checkbox' ? target.checked : target.value
        const name = target.name
        if( fields[name] ){
            if( fields[name].type==="Float" )
            {
                value = parseFloat(value)
            }else if( fields[name].type==="Int" ){

                value = parseInt(value)
            }
        }
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
                this.props.onChange({name, value, target})
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
        const {fields, onKeyDown, primaryButton, caption, autoFocus, classes} = this.props

        const formFields = Object.keys(fields).map((k, i) => {
            const o = fields[k],
                value = this.state.fields[k]

            const uitype = o.uitype || (o.enum ? 'select' : 'text')

            if (uitype === 'editor' || uitype === 'jseditor') {
                let highlight, json
                if (uitype === 'jseditor') {
                    highlight = 'js'
                } else if (value) {
                    // detect type
                    try {
                        json = JSON.stringify(JSON.parse(value), null, 4)
                        highlight = 'json'
                    } catch (e) {

                    }
                }
                return <div key={k} className={classes.editor}><ContentEditable lines highlight={highlight}
                                                                                onChange={(v) => this.handleInputChange({
                                                                                    target: {
                                                                                        name: k,
                                                                                        value: v
                                                                                    }
                                                                                })}>{json ? json : value}</ContentEditable>
                </div>

            }
            if (uitype === 'image') {
                return <FileDrop key={k}/>
            } else if (uitype === 'type_picker') {

                return <TypePicker value={(value ? (value.constructor === Array ? value : [value]) : null)}
                                   error={!!this.state.fieldErrors[k]}
                                   helperText={this.state.fieldErrors[k]}
                                   onChange={this.handleInputChange} key={k}
                                   name={k}
                                   label={o.label}
                                   multi={o.multi}
                                   pickerField={o.pickerField}
                                   fields={o.fields}
                                   type={o.type} placeholder={o.placeholder}/>
            } else if (uitype === 'select') {
                return <SimpleSelect key={k} name={k} onChange={this.handleInputChange} items={o.enum} multi={o.multi}
                                     value={value}/>
            } else if (o.type === 'Boolean') {
                return <SimpleSwitch key={k} label={o.placeholder} name={k}
                                     onChange={this.handleInputChange} checked={value ? true : false}/>

            } else {
                if (o.localized) {

                    return config.LANGUAGES.reduce((a, l) => {
                        const fieldName = k + '.' + l
                        a.push(<TextField key={fieldName}
                                          error={!!this.state.fieldErrors[fieldName]}
                                          helperText={this.state.fieldErrors[fieldName]}
                                          label={o.label}
                                          fullWidth={o.fullWidth}
                                          type={uitype}
                                          placeholder={o.placeholder + ' [' + l + ']'}
                                          value={(value && value[l] ? value[l] : '')}
                                          name={fieldName}
                                          onKeyDown={(e) => {
                                              onKeyDown && onKeyDown(e, value[l])
                                          }}
                                          onChange={this.handleInputChange}/>)
                        return a
                    }, [])
                } else {
                    return <TextField autoFocus={autoFocus && i === 0} error={!!this.state.fieldErrors[k]}
                                      key={k}
                                      label={o.label}
                                      helperText={this.state.fieldErrors[k]}
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

        return (
            <form>
                {formFields}
                {primaryButton != false ?
                    <Button color="primary" variant="contained" disabled={!this.state.isValid}
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
    primaryButton: PropTypes.bool,
    classes: PropTypes.object.isRequired,
    autoFocus: PropTypes.bool
}

export default withStyles(styles)(GenericForm)