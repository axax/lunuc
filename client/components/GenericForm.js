import React from 'react'
import PropTypes from 'prop-types'
import {Button, TextField, SimpleSwitch, SimpleSelect} from 'ui/admin'
import FileDrop from './FileDrop'
import TypePicker from './TypePicker'
import config from 'gen/config'
import CodeEditor from './CodeEditor'
import {withStyles} from 'ui/admin'
import {checkFieldType} from 'util/types'
import Hook from '../../util/hook'

const styles = theme => ({
    editor: {
        border: '1px solid ' + theme.palette.grey['200'],
        margin: theme.spacing(3) + 'px 0',
        height: '20rem'
    }
})


class GenericForm extends React.Component {
    constructor(props) {
        super(props)
        this.state = GenericForm.getInitalState(props)
    }

    static getInitalState = (props) => {
        const initalState = {fieldsOri: props.fields, fields: {}, fieldErrors: {}, isValid: true}
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


    static getDerivedStateFromProps(nextProps, prevState) {
        if (nextProps.fields !== prevState.fieldsOri) {
            console.log('GenericForm fields changed')
            console.log(prevState.fieldsOri, nextProps.fields)
            return GenericForm.getInitalState(nextProps)
        }
        return null
    }

    shouldComponentUpdate(props, state) {
        return props.fields !== this.props.fields || state !== this.state
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
                        fieldErrors[k] = 'Field is required'
                    }
                } else {
                    if (field.localized) {
                        config.LANGUAGES.forEach(lang => {
                            if (!theState.fields[k] || !theState.fields[k][lang] || !theState.fields[k][lang].trim() === '') {
                                fieldErrors[k + '.' + lang] = 'Field is required'
                            }
                        })
                    } else {
                        if (!theState.fields[k] || theState.fields[k].trim() === '') {
                            fieldErrors[k] = 'Field is required'
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

    reset = () => {
        this.setState(this.getInitalState(this.props))
        this.setValidateState(this.state)
    }


    handleInputChange = (e) => {

        const {fields} = this.props

        const target = e.target, name = target.name
        let value = target.type === 'checkbox' ? target.checked : target.value

        if (fields[name]) {
            value = checkFieldType(value, fields[name])
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
                setTimeout(() => {
                    if(target.focus)
                        target.focus()
                }, 600)
            }
            newState.isValid = this.validate(newState)
            return newState
        })
    }


    handleBlur = (e) => {
        const {onBlur} = this.props
        if (onBlur) {
            onBlur(e)
        }
    }

    onAddClick = () => {
        if (this.props.onClick)
            this.props.onClick(this.state.fields)
        this.setState(this.getInitalState(this.props))
    }

    render() {
        const {fields, onKeyDown, primaryButton, caption, autoFocus, classes} = this.props
        const formFields = Object.keys(fields).map((k, i) => {
            const field = fields[k], value = this.state.fields[k]
            if (field.readOnly) {
                return
            }
            const uitype = field.uitype || (field.enum ? 'select' : 'text')

            if (['json', 'editor', 'jseditor'].indexOf(uitype) >= 0) {

                let highlight, json
                if (uitype === 'jseditor') {
                    highlight = 'js'
                } else if (uitype === 'json') {
                    highlight = 'json'
                } else if (value) {
                    // detect type
                    try {
                        json = JSON.stringify(JSON.parse(value), null, 2)
                        highlight = 'json'
                    } catch (e) {

                    }
                }
                return <CodeEditor className={classes.editor} key={k} onChange={(v) => this.handleInputChange({
                    target: {
                        name: k,
                        value: v
                    }
                })} lineNumbers type={highlight}>{json ? json : value}</CodeEditor>

            } else if (uitype === 'image') {

                return <FileDrop key={k} value={value}/>


            } else if (uitype === 'type_picker') {

                return <TypePicker value={(value ? (value.constructor === Array ? value : [value]) : null)}
                                   error={!!this.state.fieldErrors[k]}
                                   helperText={this.state.fieldErrors[k]}
                                   onChange={this.handleInputChange} key={k}
                                   name={k}
                                   label={field.label}
                                   multi={field.multi}
                                   pickerField={field.pickerField}
                                   fields={field.fields}
                                   type={field.type} placeholder={field.placeholder}/>
            } else if (uitype === 'select') {
                return <SimpleSelect key={k} name={k} onChange={this.handleInputChange} items={field.enum}
                                     multi={field.multi}
                                     value={value || []}/>
            } else if (field.type === 'Boolean') {
                return <SimpleSwitch key={k} label={field.placeholder} name={k}
                                     onChange={this.handleInputChange} checked={value ? true : false}/>


            } else {

                const result = {}

                Hook.call('GenericFormField', {field, result, value}, this)

                if (result.component) {
                    return result.component
                }

                if (field.localized) {

                    return config.LANGUAGES.reduce((a, l) => {
                        const fieldName = k + '.' + l
                        a.push(<TextField key={fieldName}
                                          error={!!this.state.fieldErrors[fieldName]}
                                          helperText={this.state.fieldErrors[fieldName]}
                                          label={field.label}
                                          fullWidth={field.fullWidth}
                                          type={uitype}
                                          placeholder={field.placeholder + ' [' + l + ']'}
                                          value={(value && value[l] ? value[l] : '')}
                                          name={fieldName}
                                          onKeyDown={(e) => {
                                              onKeyDown && onKeyDown(e, value[l])
                                          }}
                                          onBlur={this.handleBlur}
                                          onChange={this.handleInputChange}/>)
                        return a
                    }, [])
                } else {
                    return <TextField autoFocus={autoFocus && i === 0} error={!!this.state.fieldErrors[k]}
                                      key={k}
                                      label={field.label}
                                      helperText={this.state.fieldErrors[k]}
                                      fullWidth={field.fullWidth}
                                      type={uitype}
                                      placeholder={field.placeholder || field.name}
                                      value={value || ''}
                                      name={k}
                                      onKeyDown={(e) => {
                                          onKeyDown && onKeyDown(e, value)
                                      }}
                                      onBlur={this.handleBlur}
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
    onChange: PropTypes.func,
    onBlur: PropTypes.func,
    caption: PropTypes.string,
    primaryButton: PropTypes.bool,
    classes: PropTypes.object.isRequired,
    autoFocus: PropTypes.bool
}

export default withStyles(styles)(GenericForm)
