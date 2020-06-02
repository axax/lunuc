import React from 'react'
import PropTypes from 'prop-types'
import {
    Button,
    TextField,
    SimpleSwitch,
    SimpleSelect,
    InputLabel,
    FormHelperText,
    FormControl,
    Tabs,
    Tab,
    Typography,
    Box,
    DeleteIconButton
} from 'ui/admin'
import FileDrop from './FileDrop'
import TypePicker from './TypePicker'
import config from 'gen/config'
import CodeEditor from './CodeEditor'
import TinyEditor from './TinyEditor'
import {withStyles} from 'ui/admin'
import {checkFieldType} from 'util/typesAdmin'
import Hook from '../../util/hook'
import classNames from 'classnames'
import Expandable from 'client/components/Expandable'
import _t from '../../util/i18n'
import Util from "../util";

const styles = theme => {
    return {
        editor: {
            border: '1px solid ' + theme.palette.grey['200'],
            margin: theme.spacing(3) + 'px 0',
            height: '20rem'
        },
        formField: {
            minWidth: 'calc(25% - ' + theme.spacing(2) + 'px)',
            margin: theme.spacing(1) + 'px',
        },
        formFieldFull: {
            width: 'calc(100% - ' + theme.spacing(2) + 'px)',
            margin: theme.spacing(1) + 'px',
        },
        tabContainer: {
            backgroundColor: theme.palette.background.paper
        }
    }
}


const AntTabs = withStyles({
    root: {
        borderBottom: '1px solid #e8e8e8',
    },
    indicator: {
        backgroundColor: '#1890ff',
    },
})(Tabs)

const AntTab = withStyles((theme) => ({
    root: {
        textTransform: 'none',
        minWidth: 72,
        fontWeight: theme.typography.fontWeightRegular,
        marginRight: theme.spacing(4),
        fontFamily: [
            '-apple-system',
            'BlinkMacSystemFont',
            '"Segoe UI"',
            'Roboto',
            '"Helvetica Neue"',
            'Arial',
            'sans-serif',
            '"Apple Color Emoji"',
            '"Segoe UI Emoji"',
            '"Segoe UI Symbol"',
        ].join(','),
        '&:hover': {
            color: '#40a9ff',
            opacity: 1,
        },
        '&$selected': {
            color: '#1890ff',
            fontWeight: theme.typography.fontWeightMedium,
        },
        '&:focus': {
            color: '#40a9ff',
        },
    },
    selected: {},
}))((props) => <Tab disableRipple {...props} />)


function TabPanel(props) {
    const {children, value, index, ...other} = props

    return (
        <Typography
            component="div"
            hidden={value !== index}
            {...other}
        >
            {value === index && <Box p={3}>{children}</Box>}
        </Typography>
    )
}

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
            tabValue: 0
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
        const formValidation = GenericForm.staticValidate(initalState, props)
        initalState.isValid = formValidation.isValid
        initalState.fieldErrors = formValidation.fieldErrors
        return initalState
    }


    static getDerivedStateFromProps(nextProps, prevState) {
        if (nextProps.updatekey !== prevState.updatekey || (!nextProps.updatekey && nextProps.fields !== prevState.fieldsOri)) {
            console.log('GenericForm fields changed')
            return GenericForm.getInitalState(nextProps)
        }
        return null
    }

    static staticValidate(state, props) {
        const {fields, onValidate} = props
        const fieldErrors = {}
        Object.keys(fields).forEach(fieldKey => {
            const field = fields[fieldKey]
            if (field.required) {

                if (field.reference) {
                    let fieldValue = state.fields[fieldKey]
                    if (fieldValue && fieldValue.length) {
                        fieldValue = fieldValue[0]
                    }
                    if (!fieldValue || !fieldValue._id) {
                        fieldErrors[fieldKey] = _t('GenericForm.fieldIsRequired')
                    }
                } else {
                    if (field.localized) {
                        config.LANGUAGES.forEach(lang => {
                            if (!state.fields[fieldKey] || !state.fields[fieldKey][lang] || !state.fields[fieldKey][lang].trim() === '') {
                                fieldErrors[fieldKey + '.' + lang] = _t('GenericForm.fieldIsRequired')
                            }
                        })
                    } else {
                        const value = state.fields[fieldKey]
                        if (!value || (value.constructor === String && value.trim() === '')) {
                            fieldErrors[fieldKey] = _t('GenericForm.fieldIsRequired')
                        }
                    }
                }
            }
        })
        let validationState
        if (Object.keys(fieldErrors).length) {
            validationState = {isValid: false, fieldErrors}
        } else if (onValidate) {
            validationState = onValidate(state.fields)
            if (!validationState.fieldErrors) {
                validationState.fieldErrors = {}
            }
        } else {
            validationState = {isValid: true, fieldErrors}
        }
        return validationState
    }

    shouldComponentUpdate(props, state) {
        return state !== this.state || state.fieldErrors !== this.state.fieldErrors
    }

    validate(state = this.state, updateState = true) {

        const validationState = GenericForm.staticValidate(state, this.props)

        if (updateState) {
            this.setState(validationState)
        }
        return validationState
    }

    reset = () => {
        this.setState(GenericForm.getInitalState(this.props))
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
            const formValidation = this.validate(newState, false)
            return Object.assign(newState, formValidation)
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
        const fieldKeys = Object.keys(fields), formFields = [], tabs = {}

        let expandableField, expandableData
        for (let fieldIndex = 0; fieldIndex < fieldKeys.length; fieldIndex++) {
            const fieldKey = fieldKeys[fieldIndex],
                field = fields[fieldKey]
            if (field.readOnly || (field.role && !Util.hasCapability({userData:_app_.user}, field.role))) {
                continue
            }
            let value = this.state.fields[fieldKey]
            if (field.replaceBreaks && value) {
                value = value.replace(/<br>/g, '\n')
            }

            let currentFormFields = formFields

            if (expandableField) {
                currentFormFields = expandableData
            } else if (field.expandable) {
                expandableField = field
                expandableData = currentFormFields = []
            } else if (field.tab) {
                if (!tabs[field.tab]) {
                    tabs[field.tab] = []
                }
                currentFormFields = tabs[field.tab]
            }


            if (field.newLine) {
                currentFormFields.push(<br key={'br' + fieldKey}/>)
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
                currentFormFields.push(<FormControl key={'control' + fieldKey}
                                                    className={classNames(classes.formFieldFull)}>
                    <InputLabel key={'label' + fieldKey} shrink>{field.label}</InputLabel><CodeEditor
                    className={classes.editor} key={fieldKey}
                    onChange={(newValue) => this.handleInputChange({
                        target: {
                            name: fieldKey,
                            value: newValue
                        }
                    })} lineNumbers type={highlight}>{json ? json : value}</CodeEditor></FormControl>)

            } else if (uitype === 'html') {
                const hasError = !!this.state.fieldErrors[fieldKey]


                const fieldName = fieldKey + (field.localized? '.' + _app_.lang:'')

                currentFormFields.push(<FormControl style={{zIndex: 1}} key={'control' + fieldName}
                                                    className={classNames(classes.formFieldFull)}>
                    <InputLabel key={'label' + fieldName} shrink>{field.label}</InputLabel>
                    <TinyEditor key={fieldName} id={fieldName} error={hasError} style={{marginTop: '1.5rem'}}

                                onChange={(newValue) => this.handleInputChange({
                                    target: {
                                        name: fieldName,
                                        value: newValue
                                    }
                                })}>{field.localized?value[_app_.lang]:value}</TinyEditor>
                    {(hasError ?
                        <FormHelperText error>Bitte
                            ausfüllen</FormHelperText> : '')}
                </FormControl>)

            } else if (uitype === 'hr') {

                currentFormFields.push(<hr/>)

            } else if (uitype === 'button') {

                currentFormFields.push(<Button key={fieldKey}
                                               color="primary" variant="contained"
                                               onClick={() => {
                                                   if (this.props.onButtonClick)
                                                       this.props.onButtonClick(field)
                                               }}>{field.label}</Button>)


            } else if (uitype === 'image') {

                currentFormFields.push(<FileDrop key={fieldKey} value={value}/>)


            } else if (uitype === 'type_picker') {
                currentFormFields.push(<TypePicker
                    value={(value ? (value.constructor === Array ? value : [value]) : null)}
                    error={!!this.state.fieldErrors[fieldKey]}
                    helperText={this.state.fieldErrors[fieldKey]}
                    onChange={this.handleInputChange}
                    className={classNames(classes.formField, field.fullWidth && classes.formFieldFull)}
                    fullWidth={field.fullWidth}
                    key={fieldKey}
                    name={fieldKey}
                    label={field.label}
                    filter={field.filter}
                    multi={field.multi}
                    pickerField={field.pickerField}
                    searchFields={field.searchFields}
                    fields={field.fields}
                    type={field.type} placeholder={field.placeholder}/>)
            } else if (uitype === 'select') {
                currentFormFields.push(<SimpleSelect
                    key={fieldKey} name={fieldKey}
                    onChange={this.handleInputChange}
                    items={field.enum}
                    error={!!this.state.fieldErrors[fieldKey]}
                    hint={this.state.fieldErrors[fieldKey]}
                    multi={field.multi}
                    label={field.label}
                    className={classNames(classes.formField, field.fullWidth && classes.formFieldFull)}
                    InputLabelProps={{
                        shrink: true,
                    }}
                    value={value || []}/>)
            } else if (field.type === 'Boolean') {
                currentFormFields.push(<SimpleSwitch key={fieldKey}
                                                     label={field.label || field.placeholder}
                                                     name={fieldKey}
                                                     className={classNames(classes.formField, field.fullWidth && classes.formFieldFull)}
                                                     onChange={this.handleInputChange} checked={value ? true : false}/>)


            } else {

                const result = {}

                Hook.call('GenericFormField', {field, result, value}, this)

                if (result.component) {
                    currentFormFields.push(result.component)
                    continue
                }

                if (field.localized) {
                    currentFormFields.push(config.LANGUAGES.reduce((arr, languageCode) => {
                        const fieldName = fieldKey + '.' + languageCode
                        arr.push(<TextField key={fieldName}
                                            error={!!this.state.fieldErrors[fieldName]}
                                            helperText={this.state.fieldErrors[fieldName]}
                                            label={field.label + ' [' + languageCode + ']'}
                                            className={classNames(classes.formField, field.fullWidth && classes.formFieldFull)}
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
                    }, []))
                } else {
                    currentFormFields.push(<TextField autoFocus={autoFocus && fieldIndex === 0}
                                                      error={!!this.state.fieldErrors[fieldKey]}
                                                      key={fieldKey}
                                                      id={fieldKey}
                                                      label={field.label || field.name}
                                                      className={classNames(classes.formField, field.fullWidth && classes.formFieldFull)}
                                                      InputLabelProps={{
                                                          shrink: true,
                                                      }}
                                                      helperText={this.state.fieldErrors[fieldKey]}
                                                      fullWidth={field.fullWidth}
                                                      type={uitype}
                                                      multiline={uitype === 'textarea'}
                                                      placeholder={field.placeholder}
                                                      value={value || field.defaultValue || ''}
                                                      name={fieldKey}
                                                      onKeyDown={(e) => {
                                                          onKeyDown && onKeyDown(e, value)
                                                      }}
                                                      onBlur={this.handleBlur}
                                                      onChange={this.handleInputChange}/>)
                }

            }

            if (field.expandable === false) {


                let holder = formFields

                if (expandableField.tab) {
                    if (!tabs[expandableField.tab]) {
                        tabs[expandableField.tab] = []
                    }
                    holder = tabs[expandableField.tab]
                }

                holder.push(<Expandable title={expandableField.expandable}
                                        key={"expandable"+fieldKey}
                                        onChange={(e) => {
                                            this.setState({expanded: fieldKey})
                                        }}
                                        expanded={this.state.expanded===fieldKey}>
                    {currentFormFields}
                </Expandable>)

                expandableField = null
            }

        }

        const {tabValue} = this.state
        const tabKeys = Object.keys(tabs)
        console.log('render GenericForm')

        return (
            <form className={classes.form}>
                {tabKeys.length === 0 && formFields}
                {tabKeys.length > 0 && <div className={classes.tabContainer}>
                    <AntTabs
                        value={tabValue}
                        onChange={(e, newValue) => {
                            this.setState({tabValue: newValue})
                        }}
                    >
                        {tabKeys.map((value, i) =>
                            <AntTab key={'tab-' + i} label={value}/>
                        )}

                        {formFields.length > 0 && <AntTab key={'tab-' + tabKeys.length} label="Weitere Einstellungen"/>}

                    </AntTabs>

                    {tabKeys.map((value, i) =>
                        <TabPanel key={'tabPanel-' + i} value={tabValue} index={i}>
                            {tabs[value]}
                        </TabPanel>
                    )}
                    {formFields.length > 0 &&
                    <TabPanel key={'tabPanel-' + tabKeys.length} value={tabValue} index={tabKeys.length}>
                        {formFields}
                    </TabPanel>}

                </div>}
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
    onButtonClick: PropTypes.func,
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
