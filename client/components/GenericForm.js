import React from 'react'
import PropTypes from 'prop-types'
import {Button, TextField, SimpleSwitch, SimpleSelect, InputLabel, FormHelperText, FormControl} from 'ui/admin'
import FileDrop from './FileDrop'
import TypePicker from './TypePicker'
import config from 'gen/config'
import CodeEditor from './CodeEditor'
import QuillEditor from './QuillEditor'
import {withStyles} from 'ui/admin'
import {checkFieldType} from 'util/typesAdmin'
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
        const initalState = {
            updatekey: props.updatekey,
            fieldsOri: props.fields,
            fields: {},
            fieldErrors: {},
            isValid: true
        }
        Object.keys(props.fields).map(k => {
            const field = props.fields[k]
            let fieldValue
            if (field.localized) {
                fieldValue = props.values && props.values[k] ? Object.assign({}, props.values[k]) : null
            } else {
                if (props.values) {
                    fieldValue = props.values[k]
                } else {
                    // value must be null instead of undefined
                    fieldValue = field.value === undefined ? null : field.value
                }
            }
            initalState.fields[k] = fieldValue
        })
        return initalState
    }


    static getDerivedStateFromProps(nextProps, prevState) {
        if (nextProps.updatekey !== prevState.updatekey || (!nextProps.updatekey && nextProps.fields !== prevState.fieldsOri)) {
            console.log('GenericForm fields changed')
            return GenericForm.getInitalState(nextProps)
        }
        return null
    }

    shouldComponentUpdate(props, state) {
        return state !== this.state
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
        Object.keys(fields).forEach(fieldKey => {
            const field = fields[fieldKey]
            if (field.required) {

                if (field.reference) {
                    let fieldValue = theState.fields[fieldKey]
                    if (fieldValue && fieldValue.length) {
                        fieldValue = fieldValue[0]
                    }
                    if (!fieldValue || !fieldValue._id) {
                        fieldErrors[fieldKey] = 'Field is required'
                    }
                } else {
                    if (field.localized) {
                        config.LANGUAGES.forEach(lang => {
                            if (!theState.fields[fieldKey] || !theState.fields[fieldKey][lang] || !theState.fields[fieldKey][lang].trim() === '') {
                                fieldErrors[fieldKey + '.' + lang] = 'Field is required'
                            }
                        })
                    } else {
                        const value = theState.fields[fieldKey]
                        if (!value || (value.constructor === String && value.trim() === '')) {
                            fieldErrors[fieldKey] = 'Field is required'
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
        this.setState(GenericForm.getInitalState(this.props))
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

            // for localization --> name.de / name.en
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


    handleBlur = (e) => {
        const {onBlur} = this.props
        if (onBlur) {
            onBlur(e)
        }
    }

    onAddClick = () => {
        if (this.props.onClick)
            this.props.onClick(this.state.fields)
        this.setState(GenericForm.getInitalState(this.props))
    }

    render() {
        const {fields, onKeyDown, primaryButton, caption, autoFocus, classes} = this.props
        const formFields = Object.keys(fields).map((fieldKey, fieldIndex) => {
            const field = fields[fieldKey], value = this.state.fields[fieldKey]
            if (field.readOnly) {
                return
            }
            const uitype = (field.uitype === 'datetime' ? 'datetime-local' : 0) || field.uitype || (field.enum ? 'select' : 'text')

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
                return <CodeEditor className={classes.editor} key={fieldKey}
                                   onChange={(newValue) => this.handleInputChange({
                                       target: {
                                           name: fieldKey,
                                           value: newValue
                                       }
                                   })} lineNumbers type={highlight}>{json ? json : value}</CodeEditor>

            } else if (uitype === 'html') {
                return <FormControl fullWidth>
                    <InputLabel htmlFor="my-input" shrink>{field.label}</InputLabel>
                    <QuillEditor key={fieldKey} id={fieldKey} style={{marginTop: '1.5rem'}}
                                 onChange={(newValue) => this.handleInputChange({
                                     target: {
                                         name: fieldKey,
                                         value: newValue
                                     }
                                 })}>{value}</QuillEditor>
                    {(!!this.state.fieldErrors[fieldKey] ?
                    <FormHelperText>Bitte
                        ausfüllen</FormHelperText> : '')}
                </FormControl>

            } else if (uitype === 'image') {

                return <FileDrop key={fieldKey} value={value}/>


            } else if (uitype === 'type_picker') {
                return <TypePicker value={(value ? (value.constructor === Array ? value : [value]) : null)}
                                   error={!!this.state.fieldErrors[fieldKey]}
                                   helperText={this.state.fieldErrors[fieldKey]}
                                   onChange={this.handleInputChange}
                                   key={fieldKey}
                                   name={fieldKey}
                                   label={field.label}
                                   filter={field.filter}
                                   multi={field.multi}
                                   pickerField={field.pickerField}
                                   fields={field.fields}
                                   type={field.type} placeholder={field.placeholder}/>
            } else if (uitype === 'select') {
                return <SimpleSelect key={fieldKey} name={fieldKey} onChange={this.handleInputChange} items={field.enum}
                                     multi={field.multi}
                                     label={field.label}
                                     InputLabelProps={{
                                         shrink: true,
                                     }}
                                     value={value || []}/>
            } else if (field.type === 'Boolean') {
                return <SimpleSwitch key={fieldKey} label={field.label || field.placeholder} name={fieldKey}
                                     onChange={this.handleInputChange} checked={value ? true : false}/>


            } else {

                const result = {}

                Hook.call('GenericFormField', {field, result, value}, this)

                if (result.component) {
                    return result.component
                }

                if (field.localized) {
                    return config.LANGUAGES.reduce((arr, languageCode) => {
                        const fieldName = fieldKey + '.' + languageCode
                        arr.push(<TextField key={fieldName}
                                            error={!!this.state.fieldErrors[fieldName]}
                                            helperText={this.state.fieldErrors[fieldName]}
                                            label={field.label}
                                            InputLabelProps={{
                                                shrink: true,
                                            }}
                                            multiline={uitype === 'textarea'}
                                            fullWidth={field.fullWidth}
                                            type={uitype}
                                            placeholder={(field.placeholder ? field.placeholder + ' ' : '') + '[' + languageCode + ']'}
                                            value={(value && value[languageCode] ? value[languageCode] : '')}
                                            name={fieldName}
                                            onKeyDown={(e) => {
                                                onKeyDown && onKeyDown(e, value[languageCode])
                                            }}
                                            onBlur={this.handleBlur}
                                            onChange={this.handleInputChange}/>)
                        return arr
                    }, [])
                } else {
                    return <TextField autoFocus={autoFocus && fieldIndex === 0}
                                      error={!!this.state.fieldErrors[fieldKey]}
                                      key={fieldKey}
                                      id={fieldKey}
                                      label={field.label}
                                      InputLabelProps={{
                                          shrink: true,
                                      }}
                                      helperText={this.state.fieldErrors[fieldKey]}
                                      fullWidth={field.fullWidth}
                                      type={uitype}
                                      multiline={uitype === 'textarea'}
                                      placeholder={field.placeholder || field.name}
                                      value={value || ''}
                                      name={fieldKey}
                                      onKeyDown={(e) => {
                                          onKeyDown && onKeyDown(e, value)
                                      }}
                                      onBlur={this.handleBlur}
                                      onChange={this.handleInputChange}/>
                }

            }
        })
        console.log('render GenericForm')

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
    updatekey: PropTypes.string,
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
