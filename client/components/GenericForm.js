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
    SimpleTab,
    SimpleTabPanel,
    SimpleTabs,
    InputAdornment,
    Input,
    ExpandLessIconButton,
    ExpandMoreIconButton,
    TranslateIconButton
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
import {_t} from '../../util/i18n'
import Util from '../util'
import DomUtil from '../util/dom'

const styles = theme => {
    return {
        editor: {
            border: '1px solid ' + theme.palette.grey['200'],
            margin: theme.spacing(3) + 'px 0'
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
        },
        translationAbsolute: {
            right: '3.55rem',
            marginTop: '-0.5rem',
            position: 'absolute',
            zIndex: 2
        }
    }
}

class GenericForm extends React.Component {
    constructor(props) {
        super(props)
        this.state = GenericForm.getInitalState(props, {})
    }

    static getInitalState = (props, prevState) => {
        const initalState = {
            updatekey: props.updatekey,
            fieldsOri: props.fields,
            fields: {},
            showTranslations: {},
            tabValue: prevState && prevState.tabValue ? prevState.tabValue : 0
        }
        Object.keys(props.fields).map(k => {
            const field = props.fields[k]
            let fieldValue
            if (field.localized) {
                if (props.values && props.values[k]) {
                    if (props.values[k].constructor === String) {
                        config.LANGUAGES.forEach(lang => {
                            fieldValue[lang] = props.values[k]
                        })
                    } else {
                        fieldValue = Object.assign({}, props.values[k])
                    }
                } else {
                    fieldValue = null
                }
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
            return GenericForm.getInitalState(nextProps, prevState)
        }
        return null
    }

    static staticValidate(state, props, options = {changeTab: false}) {
        const {fields, onValidate} = props
        const fieldErrors = {}, tabs = []
        Object.keys(fields).forEach(fieldKey => {
            const field = fields[fieldKey]

            if (field.tab && options.changeTab) {
                if (tabs.indexOf(field.tab) < 0) {
                    tabs.push(field.tab)
                }
            }

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
        if (!validationState.isValid && tabs.length > 0 && options.changeTab) {
            // check tabs
            let foundTab = false, relevantTabs = []
            for (const key in validationState.fieldErrors) {
                // = validationState.fieldErrors[key]
                if (fields[key].tab) {
                    if (fields[key].tab === tabs[state.tabValue]) {
                        foundTab = true
                        break
                    } else {
                        relevantTabs.push(tabs.indexOf(fields[key].tab))
                    }
                }
            }
            if (!foundTab) {
                if (relevantTabs.length > 0) {
                    validationState.tabValue = relevantTabs[0]
                } else {
                    validationState.tabValue = tabs.length
                }
            }
        }


        return validationState
    }

    reset() {
        this.setState(GenericForm.getInitalState(this.props))
    }


    shouldComponentUpdate(props, state) {
        return state !== this.state || state.fieldErrors !== this.state.fieldErrors || state.showTranslations !== this.state.showTranslations
    }


    componentWillUnmount() {
        if (this.pickr) {
            this.pickr.destroy()
        }
    }

    validate(state = this.state, updateState = true, options) {

        const validationState = GenericForm.staticValidate(state, this.props, options)
        if (updateState) {
            this.setState(validationState)
        }
        return validationState
    }

    loadFlatpickr() {

        DomUtil.addScript('https://npmcdn.com/flatpickr@4.6.6/dist/flatpickr.min.js', {
            id: 'flatpickr',
            onload: () => {
                DomUtil.addScript('https://npmcdn.com/flatpickr@4.6.6/dist/l10n/de.js', {
                    id: 'flatpickrDe',
                    onload: () => {
                        this.initFlatpickr()
                    }
                }, {ignoreIfExist: true})
            }
        }, {ignoreIfExist: true})


        DomUtil.addStyle('https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css', {id: 'html2canvas'}, {ignoreIfExist: true})

    }

    initFlatpickr() {

        if (window.flatpickr) {
            setTimeout(() => {
                flatpickr('input[type="datetime"]', {
                    enableTime: true,
                    allowInput: true,
                    altInput: true,
                    locale: 'de',
                    time_24hr: true,
                    timeFormat: "H:i",
                    defaultDate: null,
                    altFormat: "d.m.Y H:i",
                    dateFormat: "Z",
                    onChange: (date, dateStr, obj) => {
                        /*const offset = date[0].getTimezoneOffset()/60
                        const offsetStr = '+'+(offset<10 && offset>-10?'0':'')+(-(offset))+':00'*/
                        this.handleInputChange({
                            target: {
                                name: obj.element.name,
                                value: dateStr,
                                type: 'datetime'
                            }
                        })
                    }
                })
            }, 100)

        }

    }

    loadColorpicker() {
        DomUtil.addScript('https://cdn.jsdelivr.net/npm/@simonwep/pickr/dist/pickr.min.js', {
            id: 'colorpicker',
            onload: () => {
                this.initColorpicker()
            }
        }, {ignoreIfExist: true})

        DomUtil.addStyle('https://cdn.jsdelivr.net/npm/@simonwep/pickr/dist/themes/classic.min.css', {id: 'colorpickerstyle'}, {ignoreIfExist: true})
    }

    initColorpicker() {
        if (window.Pickr && !this.pickr) {
            setTimeout(() => {
                try {
                    this.pickr = new Pickr({
                        el: '[data-colorpicker] > input',
                        useAsButton: true,
                        defaultRepresentation: 'HEX',
                        components: {
                            palette: true,
                            preview: true,
                            opacity: true,
                            hue: true,
                            interaction: {
                                hex: false,
                                rgba: false,
                                hsla: false,
                                hsva: false,
                                cmyk: false,
                                input: false,
                                save: false
                            },
                        }
                    })

                    let timeout
                    this.pickr.on('change', (color, instance) => {
                        const inp = instance._root.button
                        clearTimeout(timeout)
                        timeout = setTimeout(() => {
                            this.handleInputChange({target: {name: inp.name, value: color.toHEXA().toString()}})
                        }, 300)
                    }).on('show', (color, instance) => {
                        const inp = instance._root.button
                        this.pickr.setColor(inp.value)
                    })
                } catch (e) {
                    console.log(e)
                }
            }, 500)

        }
    }

    newStateForField(prevState, name, value) {
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
        return newState
    }

    handleInputChange = (e) => {
        const {fields} = this.props
        const target = e.target, name = target.name
        let value = target.type === 'checkbox' ? target.checked : target.value
        if (target.type !== 'datetime' && fields[name]) {
            value = checkFieldType(value, fields[name])
        }
        this.setState((prevState) => {
            const newState = this.newStateForField(prevState, name, value)
            if (this.props.onChange) {
                this.props.onChange({name, value, target})
            }
            const formValidation = this.validate(newState, false)
            return Object.assign(newState, formValidation)
        })
    }


    handleBlur = (e) => {
        const {onBlur, fields} = this.props
        if (e.target.type === 'datetime') {
            const field = fields[e.target.name]
            if (field.type === 'Float') {
                // a float value is expected so convert the iso date to an unix timestamp
                const newState = this.newStateForField(this.state, e.target.name, Date.parse(e.target.value))
                this.setState(newState)
            }
        }
        if (onBlur) {
            onBlur(e)
        }
    }

    onAddClick = () => {
        if (this.props.onClick)
            this.props.onClick(this.state.fields)
        //this.setState(GenericForm.getInitalState(this.props))
    }

    render() {
        const {fields, primaryButton, caption, classes, subForm} = this.props
        const fieldKeys = Object.keys(fields), formFields = [], tabs = []


        let expandableField, expandableData, datePolyfill = false
        for (let fieldIndex = 0; fieldIndex < fieldKeys.length; fieldIndex++) {
            const fieldKey = fieldKeys[fieldIndex],
                field = fields[fieldKey]

            if (field.readOnly || (field.role && !Util.hasCapability({userData: _app_.user}, field.role))) {
                continue
            }
            let value = this.state.fields[fieldKey]
            if (field.replaceBreaks && value) {
                value = value.replace(/<br>/g, '\n')
            }
            if (field.uitype === 'datetime') {
                //iso date without ms
                try {
                    value = new Date(value).toISOString()
                } catch
                    (e) {
                    console.log(e)
                }
                datePolyfill = true
            }

            let currentFormFields = formFields

            if (expandableField) {
                currentFormFields = expandableData
            } else if (field.expandable) {
                expandableField = field
                expandableData = currentFormFields = []
            } else if (field.tab) {
                let tab = this.getOrCreateTab(tabs, field)
                currentFormFields = tab.fields
            }


            if (field.newLine) {
                currentFormFields.push(<br key={'br' + fieldKey}/>)
            }
            const uitype = field.uitype || (field.enum ? 'select' : 'text')


            if (field.subFields) {

                let values
                try {
                    values = JSON.parse(value)
                } catch (e) {
                }

                if (!values) {
                    values = {}
                }


                currentFormFields.push(<GenericForm onChange={(e) => {
                    values[e.name] = e.value
                    this.handleInputChange({
                        target: {
                            name: fieldKey,
                            value: JSON.stringify(values)
                        }
                    })

                }} primaryButton={false} values={values} key={fieldKey} subForm={true} classes={classes}
                                                    fields={field.subFields}/>)

                currentFormFields.push(<br key={'brMeta' + fieldKey}/>)
            }


            if (field.localized) {
                const showTranslations = this.state.showTranslations[fieldKey]

                const translateButton = <TranslateIconButton key={fieldKey + "translation"}
                                                             onClick={() => {

                                                                 this.setState({showTranslations: Object.assign({}, this.state.showTranslations, {[fieldKey]: !showTranslations})})
                                                             }}></TranslateIconButton>


                config.LANGUAGES.forEach(languageCode => {
                    const fieldKeyTr = fieldKey + '.' + languageCode
                    if (languageCode === _app_.lang || showTranslations || !!this.state.fieldErrors[fieldKeyTr]) {

                        this.createInputField({
                            uitype,
                            field,
                            value: value && value[languageCode] ? value[languageCode] : '',
                            currentFormFields,
                            fieldKey: fieldKeyTr,
                            fieldIndex,
                            languageCode,
                            translateButton
                        })
                    }
                })

            } else {

                if (this.createInputField({uitype, field, value, currentFormFields, fieldKey, fieldIndex})) {
                    continue
                }
            }


            if (field.expandable === false) {


                let holder = formFields

                if (expandableField.tab) {

                    let tab = this.getOrCreateTab(tabs, expandableField)
                    holder = tab.fields
                }
                holder.push(<div key={"expandableWrap" + fieldKey} style={{position: 'relative'}}>
                    <ExpandLessIconButton
                        onClick={(e) => {
                            if (this.props.onPosChange) {
                                this.props.onPosChange({field, newIndex: field.index - 1})
                            }
                        }}
                        style={{position: 'absolute', left: '-40px', top: '-10px'}}/>
                    <ExpandMoreIconButton style={{position: 'absolute', left: '-40px', top: '10px'}}
                                          onClick={() => {
                                              if (this.props.onPosChange) {
                                                  this.props.onPosChange({field, newIndex: field.index + 1})
                                              }
                                          }}/>

                    <Expandable title={expandableField.expandable}
                                key={"expandable" + fieldKey}
                                onChange={(e) => {
                                    this.setState({expanded: fieldKey})
                                }}
                                expanded={this.state.expanded === fieldKey}>
                        {currentFormFields}
                    </Expandable></div>)

                expandableField = null
            }

        }

        if (datePolyfill) {
            this.loadFlatpickr()
        }
        const {tabValue} = this.state
        console.log('render GenericForm')
        const Wrapper = subForm ? 'div' : 'form'

        return (
            <Wrapper className={classes.form}>
                {tabs.length === 0 && formFields}
                {tabs.length > 0 && <div className={classes.tabContainer}>
                    <SimpleTabs
                        value={tabValue}
                        onChange={(e, newValue) => {
                            this.setState({tabValue: newValue})
                        }}
                    >
                        {tabs.map((tab, i) =>
                            <SimpleTab key={'tab-' + i} label={tab.name}/>
                        )}

                        {formFields.length > 0 &&
                        <SimpleTab key={'tab-' + tabs.length} label="Weitere Einstellungen"/>}

                    </SimpleTabs>

                    {tabs.map((tab, i) =>
                        <SimpleTabPanel key={'tabPanel-' + i} value={tabValue} index={i}>
                            {tab.fields}
                        </SimpleTabPanel>
                    )}
                    {formFields.length > 0 &&
                    <SimpleTabPanel key={'tabPanel-' + tabs.length} value={tabValue} index={tabs.length}>
                        {formFields}
                    </SimpleTabPanel>}

                </div>}
                {primaryButton != false ?
                    <Button color="primary" variant="contained" disabled={!this.state.isValid}
                            onClick={this.onAddClick}>{caption || 'Add'}</Button>
                    : ''}
            </Wrapper>
        )
    }

    createInputField({uitype, field, value, currentFormFields, fieldKey, fieldIndex, languageCode, translateButton}) {
        const {onKeyDown, classes, autoFocus} = this.props
        let langButtonWasInserted = false
        if(!field.label){
            field.label=''
        }
        if (['json', 'editor', 'jseditor', 'css'].indexOf(uitype) >= 0) {

            let highlight, jsonStr
            if (uitype === 'css') {
                highlight = 'css'
            } else if (uitype === 'jseditor') {
                highlight = 'js'
            } else if (uitype === 'json') {
                highlight = 'json'
                if (field.type === 'Object' && value && value.constructor === String) {
                    // it should be an object but it is a string
                    try {
                        value = JSON.parse(value)
                    } catch (e) {

                    }
                }
            } else if (value && value.constructor === Object) {
                highlight = 'json'
            } else if (value) {
                // detect type
                try {
                    jsonStr = JSON.stringify(JSON.parse(value), null, 2)
                    highlight = 'json'
                } catch (e) {

                }
            }
            currentFormFields.push(<FormControl key={'control' + fieldKey}
                                                className={classNames(classes.formFieldFull)}>
                <InputLabel key={'label' + fieldKey} shrink>{field.label+ (languageCode ? ' [' + languageCode + ']' : '')}</InputLabel><CodeEditor
                className={classes.editor} key={fieldKey}
                forceJson={field.type === 'Object'}
                onChange={(newValue) => this.handleInputChange({
                    target: {
                        name: fieldKey,
                        value: newValue
                    }
                })} lineNumbers type={highlight}>{jsonStr ? jsonStr : value}</CodeEditor></FormControl>)

        } else if (uitype === 'html') {
            const hasError = !!this.state.fieldErrors[fieldKey]


            currentFormFields.push(<FormControl style={{zIndex: 1}} key={'control' + fieldKey}
                                                className={classNames(classes.formFieldFull)}>
                <InputLabel key={'label' + fieldKey}
                            shrink>{field.label + (languageCode ? ' [' + languageCode + ']' : '')}</InputLabel>
                <TinyEditor key={fieldKey} id={fieldKey} error={hasError} style={{marginTop: '1.5rem'}}

                            onChange={(newValue) => this.handleInputChange({
                                target: {
                                    name: fieldKey,
                                    value: newValue
                                }
                            })}>{value}</TinyEditor>
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


        } else if (uitype === 'color_picker') {

            currentFormFields.push(<FormControl key={'control' + fieldKey}
                                                className={classNames(classes.formFieldFull)}>
                <InputLabel key={'label' + fieldKey} shrink>{field.label}</InputLabel><Input data-colorpicker=""
                                                                                             onChange={this.handleInputChange}
                                                                                             name={fieldKey}
                                                                                             key={fieldKey}
                                                                                             value={value}/></FormControl>)

            this.loadColorpicker()


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
                                                 onChange={this.handleInputChange}
                                                 checked={value ? true : false}/>)


        } else {

            const result = {}

            Hook.call('GenericFormField', {field, result, value}, this)

            if (result.component) {
                currentFormFields.push(result.component)
                return true
            }

            langButtonWasInserted = true
            currentFormFields.push(<TextField autoFocus={autoFocus && fieldIndex === 0}
                                              error={!!this.state.fieldErrors[fieldKey]}
                                              key={fieldKey}
                                              id={fieldKey}
                                              label={(field.label || field.name) + (languageCode ? ' [' + languageCode + ']' : '')}
                                              className={classNames(classes.formField, field.fullWidth && classes.formFieldFull)}
                                              InputLabelProps={{
                                                  shrink: true,
                                              }}

                                              InputProps={{
                                                  endAdornment: languageCode === _app_.lang &&
                                                      <InputAdornment position="end">
                                                          {translateButton}
                                                      </InputAdornment>
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

        if( !langButtonWasInserted && translateButton && languageCode === _app_.lang) {
            currentFormFields.splice(currentFormFields.length-1, 0, <div key={'tr'+fieldKey} className={classes.translationAbsolute}>{translateButton}</div>)
        }

    }

    getOrCreateTab(tabs, field) {
        const filteredTabs = tabs.filter(i => i.name === field.tab)
        let tab
        if (filteredTabs.length === 0) {
            tab = {name: field.tab, fields: []}

            if (field.tabPosition >= 0) {
                tabs.splice(field.tabPosition, 0, tab)
            } else {
                tabs.push(tab)
            }
        } else {
            tab = filteredTabs[0]
        }
        return tab
    }
}

GenericForm
    .propTypes = {
    updatekey: PropTypes.string,
    fields: PropTypes.object.isRequired,
    values: PropTypes.object,
    onClick: PropTypes.func,
    onButtonClick: PropTypes.func,
    onKeyDown: PropTypes.func,
    onValidate: PropTypes.func,
    onChange: PropTypes.func,
    onPosChange: PropTypes.func,
    onBlur: PropTypes.func,
    caption: PropTypes.string,
    primaryButton: PropTypes.bool,
    classes: PropTypes.object.isRequired,
    autoFocus: PropTypes.bool
}

export default withStyles(styles)(GenericForm)
