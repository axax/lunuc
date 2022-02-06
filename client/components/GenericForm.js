import React from 'react'
import PropTypes from 'prop-types'
import {
    Divider,
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
import config from 'gen/config-client'
import TinyEditor from './TinyEditor'
import {withStyles} from 'ui/admin'
import {checkFieldType} from 'util/typesAdmin'
import Hook from '../../util/hook'
import classNames from 'classnames'
import Expandable from 'client/components/Expandable'
import {_t} from '../../util/i18n'
import Util from '../util'
import DomUtil from '../util/dom'
import {matchExpr, propertyByPath} from '../util/json'
import JsonEditor from '../../extensions/cms/components/JsonEditor'
import {Query} from '../middleware/graphql'
import {getTypeQueries} from 'util/types'
import Async from './Async'

const CodeEditor = (props) => <Async {...props} load={import(/* webpackChunkName: "codeeditor" */ './CodeEditor')}/>



const styles = theme => {
    return {
        editor: {
            border: '1px solid ' + theme.palette.grey['200'],
            margin: theme.spacing(3) + 'px 0'
        },
        formField: {
            margin: theme.spacing(1) + 'px',
            width: 'calc(100% - ' + theme.spacing(2) + 'px)',
            [theme.breakpoints.up('md')]: {
                width: 'calc(50% - ' + theme.spacing(2) + 'px)'
            }
        },
        formFieldThird: {
            margin: theme.spacing(1) + 'px',
            width: 'calc(100% - ' + theme.spacing(2) + 'px)',
            [theme.breakpoints.up('md')]: {
                width: 'calc(33.33% - ' + theme.spacing(2) + 'px)'
            }
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

const autoIncrement = (key, cb) => {
    fetch('/lunucapi/autoIncrement?key=' + key).then(response => response.json().then(cb))
}

function matchObjectValueFromList(value, field, list) {
    if (value && value.constructor === Object) {
        // find key for value
        const strValue = JSON.stringify(value)
        for (let i = 0; i < list.length; i++) {
            if (JSON.stringify(list[i].value) == strValue) {
                return list[i].name
            }
        }
        return ''
    }
    return value
}

class GenericForm extends React.Component {
    constructor(props) {
        super(props)
        this.state = GenericForm.getInitalState(props, {})
    }

    static getInitalState = (props, prevState) => {
        const initalState = {
            fieldsOri: props.fields,
            fields: {},
            valuesOri: props.values,
            showTranslations: {},
            tabValue: prevState.tabValue ? prevState.tabValue : 0
        }
        Object.keys(props.fields).map(fieldKey => {
            const field = props.fields[fieldKey]
            if (!field) {
                return
            }
            let fieldValue
            if (field.localized) {
                if (props.values && props.values[fieldKey]) {
                    if (props.values[fieldKey].constructor === String) {
                        if (!fieldValue) {
                            fieldValue = {}
                        }
                        config.LANGUAGES.forEach(lang => {
                            fieldValue[lang] = props.values[fieldKey]
                        })
                    } else {
                        fieldValue = Object.assign({}, props.values[fieldKey])
                    }
                } else {
                    fieldValue = null
                }
            } else {
                if (props.values) {
                    fieldValue = props.values[fieldKey]
                } else {
                    // value must be null instead of undefined
                    fieldValue = field.value === undefined ? null : field.value
                }
            }
            initalState.fields[fieldKey] = fieldValue
        })
        const formValidation = GenericForm.staticValidate(initalState, props)
        initalState.isValid = formValidation.isValid
        initalState.fieldErrors = formValidation.fieldErrors
        return initalState
    }


    static getDerivedStateFromProps(nextProps, prevState) {
        if (nextProps.fields !== prevState.fieldsOri ||
            (nextProps.updateOnValueChange && Util.shallowCompare(nextProps.values, prevState.valuesOri))) {
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

            if (!field) {
                return
            }

            if (field.tab && options.changeTab) {
                if (tabs.indexOf(field.tab) < 0) {
                    tabs.push(field.tab)
                }
            }
            if (field.required && (!field.uistate || !field.uistate.visible || !matchExpr(field.uistate.visible, state.fields))) {

                if(field.uitype==='select'){
                    const value = state.fields[fieldKey]
                    if(!value || value.length===0){
                        fieldErrors[fieldKey] = _t('GenericForm.fieldIsRequired')
                    }
                }else if (field.reference) {
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
                if (fields[key] && fields[key].tab) {
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
        if (props.closing) {
            return false
        }
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

        DomUtil.addScript('/flatpickr.min.js', {
            id: 'flatpickr',
            onload: () => {
                DomUtil.addScript('/flatpickr-de.js', {
                    id: 'flatpickrDe',
                    onload: () => {
                        this.initFlatpickr()
                    }
                }, {ignoreIfExist: true})
            }
        }, {ignoreIfExist: true})


        DomUtil.addStyle('/flatpickr.min.css', {id: 'flatpickrCss'}, {ignoreIfExist: true})

    }

    initFlatpickr() {

        if (window.flatpickr) {
            setTimeout(()=>{

                const {fields} = this.props
                const selector = '[data-datetime-field="true"]'
                DomUtil.waitForElement(selector,{all:true}).then((els)=>{
                    els.forEach(el=>{
                        console.log(el)
                        if(!el._flatpickr) {
                            const field = fields[el.name]
                            flatpickr(el, {
                                mode: field.multi ? 'multiple' : 'single',
                                enableTime: field.uitype === 'datetime',
                                allowInput: true,
                                altInput: true,
                                locale: 'de',
                                time_24hr: true,
                                timeFormat: "H:i",
                                defaultDate: null,
                                altFormat: field.uitype === 'datetime' ? 'd.m.Y H:i' : 'd.m.Y',
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
                        }

                    })

                }).catch(()=>{})

            },50)

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

    newStateForField(prevState, {name, value, localized}) {
        const newState = Object.assign({}, {fields: {}}, prevState)

        // for localization --> name.de / name.en
        if (localized) {
            const path = name.split('.')

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
        const {fields, trigger} = this.props
        const target = e.target, name = target.name
        let value = target.type === 'checkbox' ? target.checked : target.value
        if (fields[name]) {
            value = checkFieldType(value, fields[name])
        }
        this.setState((prevState) => {
            const newState = this.newStateForField(prevState, {
                name,
                value,
                localized: target.dataset && !!target.dataset.language
            })

            if(fields[name]) {
                const fieldTrigger = fields[name].trigger
                const changeTrigger = []

                if (trigger && trigger.change) {
                    changeTrigger.push(...trigger.change)
                }

                if (fieldTrigger && fieldTrigger.change) {
                    changeTrigger.push(...fieldTrigger.change)
                }

                if (changeTrigger.length > 0) {
                    let script = 'const rawValue=this.rawValue,state=this.state,props=this.props;' + changeTrigger.join(';')
                    try {
                        new Function(script).call({
                            state: newState,
                            rawValue: e.rawValue,
                            props: this.props
                        })
                    } catch (e) {
                        console.log('Error in trigger', e)
                    }
                }
            }
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

            //TODO check if this part is really used
            const field = fields[e.target.name]
            if (field.type === 'Float') {
                // a float value is expected so convert the iso date to an unix timestamp
                const newState = this.newStateForField(this.state, {
                    name: e.target.name,
                    value: e.target.value?Date.parse(e.target.value):0
                })
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


            if (!field) {
                continue
            }


            if (field.role && !Util.hasCapability({userData: _app_.user}, field.role)) {
                continue
            }

            if ((field.uistate && field.uistate.visible && matchExpr(field.uistate.visible, this.state.fields)) ||
                (field.access && field.access.ui && field.access.ui.role && !Util.hasCapability({userData: _app_.user}, field.access.ui.role))
            ) {
                continue
            }

            let value = this.state.fields[fieldKey]
            if (field.replaceBreaks && value) {
                value = value.replace(/<br>/g, '\n')
            }
            if (field.uitype === 'datetime') {
                //iso date without ms
                if(value===0){
                    value = ''
                }else {
                    if(!field.multi) {
                        try {
                            value = new Date(value).toISOString()
                        } catch (e) {
                            if (!field.required) {
                                value = ''
                            }
                            console.log(e)
                        }
                    }
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

            if (field.autoIncrement) {
                if (!value) {
                    //
                    autoIncrement(field.autoIncrement, json => {
                        if (json.status === 'success') {
                            const newState = this.newStateForField(this.state, {
                                name: field.name,
                                value: json.nr
                            })
                            newState.fieldErrors[field.name] = false
                            this.handleInputChange({
                                target: {
                                    name:  field.name,
                                    value: json.nr
                                }
                            })

                            //this.setState(newState)

                        }
                    })
                }
            }

            if (field.newLine) {
                currentFormFields.push(<br key={'br' + fieldKey}/>)
            }
            const uitype = field.uitype || (field.enum ? 'select' : 'text')


            if (field.subFields) {
                if (field.multi) {

                    let subFields = field.subFields

                    if (subFields.constructor === Array) {
                        subFields = subFields.reduce((acc, cur, i) => {
                            acc[cur.name] = cur
                            return acc
                        }, {})
                    }
                    let subFieldValues = []
                    if (value && value.constructor === Array) {

                        value.forEach(val => {
                            subFieldValues.push(Object.assign({}, val))
                        })
                    }
                    subFieldValues.forEach((values, index) => {
                        const valueFieldKey = fieldKey + '-' + index
                        let title = ''
                        if (field.titleTemplate) {
                            title = Util.replacePlaceholders(field.titleTemplate, values)
                        } else {
                            Object.keys(values).map(k => {
                                if (title && values[k]) {
                                    title += ' / '
                                }
                                title += values[k] || ''
                            })
                        }


                        currentFormFields.push(
                            <Expandable title={title}
                                        key={"expandable" + fieldKey}
                                        onChange={(e) => {
                                            this.setState({expanded: valueFieldKey})
                                        }}
                                        expanded={this.state.expanded === valueFieldKey}>
                                <GenericForm onChange={(e) => {
                                    values[e.name] = e.value
                                    this.handleInputChange({
                                        target: {
                                            name: fieldKey,
                                            value: subFieldValues
                                        }
                                    })

                                }} primaryButton={false} values={values} updateOnValueChange={true} key={valueFieldKey} subForm={true}
                                             classes={classes}
                                             fields={subFields}/>
                                <Button key={'delete' + valueFieldKey}
                                        color="secondary"
                                        size="small"
                                        onClick={() => {
                                            subFieldValues.splice(index, 1)
                                            this.handleInputChange({
                                                target: {
                                                    name: fieldKey,
                                                    value: subFieldValues
                                                }
                                            })
                                        }}
                                        variant="contained">Löschen</Button>

                            </Expandable>)
                    })
                    currentFormFields.push(<Button key={fieldKey}
                                                   color="primary"
                                                   variant="contained"
                                                   size="small"
                                                   style={field.style}
                                                   onClick={() => {

                                                       const initData = {}
                                                       let c = 0
                                                       const next = () => {
                                                           if (c == 0) {

                                                               subFieldValues.push(initData)

                                                               this.handleInputChange({
                                                                   target: {
                                                                       name: fieldKey,
                                                                       value: subFieldValues
                                                                   }
                                                               })
                                                           }

                                                       }

                                                       Object.keys(subFields).forEach(k => {
                                                           if (subFields[k].autoIncrement && !initData[k]) {
                                                               c++
                                                               autoIncrement(subFields[k].autoIncrement, json => {
                                                                   if (json.status === 'success') {
                                                                       initData[k] = json.nr
                                                                   }
                                                                   c--
                                                                   next()
                                                               })
                                                           }
                                                       })

                                                       next()

                                                   }}>{field.addButton || field.label}</Button>)

                } else {


                    let values, wasString = false
                    if (value && value.constructor === String) {
                        wasString = true
                        try {
                            values = JSON.parse(value)
                        } catch (e) {
                        }
                    } else {
                        values = value
                    }

                    if (!values) {
                        values = {}
                    }

                    currentFormFields.push(<GenericForm onChange={(e) => {
                        values[e.name] = e.value
                        this.handleInputChange({
                            target: {
                                name: fieldKey,
                                value: wasString ? JSON.stringify(values) : values
                            }
                        })

                    }} primaryButton={false} values={values} updateOnValueChange={true} key={fieldKey} subForm={true} classes={classes}
                                                        fields={field.subFields}/>)

                }


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
                if (this.createInputField({
                    uitype,
                    field,
                    value,
                    currentFormFields,
                    fieldKey,
                    fieldIndex
                })) {
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

        for (let i = tabs.length - 1; i >= 0; i--) {
            if (tabs[i].fields.length == 0) {
                tabs.splice(i, 1)
            }
        }

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
        if (!field.label) {
            field.label = ''
        }

        if (field.description) {
            currentFormFields.push(<p>{field.description}</p>)
        }
        if (uitype === 'htmlParser') {
            currentFormFields.push(<span dangerouslySetInnerHTML={{__html: field.html}}/>)

        } else if (uitype === 'wrapper') {
            // do nothing for now
        } else if (['json', 'jsonEditor', 'editor', 'jseditor', 'css'].indexOf(uitype) >= 0) {
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


            if(field.highlight){
                const newHighlight = Util.replacePlaceholders(field.highlight, this.state.fields)
                if(newHighlight){
                    highlight = newHighlight
                }
            }


            currentFormFields.push(<FormControl key={'control' + fieldKey}
                                                className={classNames(classes.formFieldFull)}>
                <InputLabel key={'label' + fieldKey}
                            shrink>{field.label + (languageCode ? ' [' + languageCode + ']' : '')}</InputLabel>

                {uitype == 'jsonEditor' ? <JsonEditor onChange={(newValue) => this.handleInputChange({
                        target: {
                            dataset: {
                                language: languageCode
                            },
                            name: fieldKey,
                            value: newValue
                        }
                    })}>{value}</JsonEditor> :

                    <CodeEditor
                        readOnly={field.readOnly}
                        className={classes.editor} key={fieldKey}
                        forceJson={field.type === 'Object'}
                        onChange={(newValue) => this.handleInputChange({
                            target: {
                                dataset: {
                                    language: languageCode
                                },
                                name: fieldKey,
                                value: newValue
                            }
                        })} lineNumbers type={highlight}>{jsonStr ? jsonStr : value}</CodeEditor>
                }
            </FormControl>)

        } else if (uitype === 'html') {
            const hasError = !!this.state.fieldErrors[fieldKey]


            currentFormFields.push(<FormControl style={{zIndex: 1}} key={'control' + fieldKey}
                                                className={classNames(classes.formFieldFull)}>
                <InputLabel key={'label' + fieldKey}
                            shrink>{field.label + (languageCode ? ' [' + languageCode + ']' : '')}</InputLabel>
                <TinyEditor key={fieldKey} id={fieldKey} error={hasError} style={{marginTop: '1.5rem'}}

                            onChange={(newValue) => this.handleInputChange({
                                target: {
                                    dataset: {
                                        language: languageCode
                                    },
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
                                           color="primary"
                                           variant="contained"
                                           style={field.style}
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
                readOnly={field.readOnly}
                genericType={field.genericType}
                filter={field.filter}
                linkTemplate={field.linkTemplate}
                multi={field.multi}
                pickerField={field.pickerField} /* fields that are searched */
                searchFields={field.searchFields} /* fields that are shown in the picker */
                projection={field.projection} /* fields that are projected and returned */
                metaFields={field.metaFields} /* fields that need user input and are returned in addtion */
                queryFields={field.fields}
                type={field.type} placeholder={field.placeholder}/>)
        } else if (uitype === 'select') {

            if (field.filter && field.type && field.path) {

                const queries = getTypeQueries(field.type, field.fields, {loadAll: false})

                currentFormFields.push(<Query query={queries.query}
                                              fetchPolicy="cache-and-network"
                                              variables={{
                                                  filter: Util.replacePlaceholders(field.filter, this.state),
                                                  limit: field.limit || 1
                                              }}>
                    {({loading, error, data}) => {
                        if (loading) return 'Loading...'
                        if (error) return `Error! ${error.message}`
                        if (!data[queries.name + 's'].results) return null

                        const obj = propertyByPath(field.path, data[queries.name + 's'].results[0])

                        const items = obj.reduce((a, c) => {

                            const name = Util.replacePlaceholders(field.titleTemplate, c)
                            a.push({
                                value: c,
                                name
                            })
                            return a
                        }, [])


                        value = matchObjectValueFromList(value, field, items)

                        return <SimpleSelect
                            readOnly={field.readOnly}
                            key={fieldKey} name={fieldKey}
                            onChange={this.handleInputChange}
                            items={items}
                            error={!!this.state.fieldErrors[fieldKey]}
                            hint={this.state.fieldErrors[fieldKey]}
                            multi={field.multi}
                            label={field.label}
                            className={classNames(classes.formField, field.fullWidth && classes.formFieldFull, field.thirdWidth && classes.formFieldThird)}
                            InputLabelProps={{
                                shrink: true,
                            }}
                            value={value}/>
                    }}
                </Query>)

            } else {

                if(field.$enum){
                    field.enum = new Function('const state = this.state;return ' + field.$enum).call({
                        state:this.state
                    })
                }

                value = matchObjectValueFromList(value, field, field.enum)

                currentFormFields.push(<SimpleSelect
                    readOnly={field.readOnly}
                    key={fieldKey}
                    name={fieldKey}
                    onChange={this.handleInputChange}
                    items={field.enum}
                    error={!!this.state.fieldErrors[fieldKey]}
                    hint={this.state.fieldErrors[fieldKey]}
                    multi={field.multi}
                    label={field.label}
                    className={classNames(classes.formField, field.fullWidth && classes.formFieldFull, field.thirdWidth && classes.formFieldThird)}
                    InputLabelProps={{
                        shrink: true,
                    }}
                    value={value}/>)
            }


        } else if (field.type === 'Boolean') {
            currentFormFields.push(<SimpleSwitch key={fieldKey}
                                                 readOnly={field.readOnly}
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

            const isDateOrTime = uitype==='date' || uitype==='datetime'

            langButtonWasInserted = true
            currentFormFields.push(<TextField autoFocus={autoFocus && fieldIndex === 0}
                                              readOnly={field.readOnly}
                                              error={!!this.state.fieldErrors[fieldKey]}
                                              key={fieldKey}
                                              id={fieldKey}
                                              label={(field.label || field.name) + (languageCode ? ' [' + languageCode + ']' : '')}
                                              className={classNames(classes.formField, field.fullWidth && classes.formFieldFull, field.thirdWidth && classes.formFieldThird)}
                                              InputLabelProps={{
                                                  shrink: true,
                                              }}
                                              inputProps={{
                                                  step: field.step || '',
                                                  'data-language': languageCode,
                                                  'data-datetime-field': isDateOrTime
                                              }}
                                              InputProps={{
                                                  endAdornment: languageCode === _app_.lang &&
                                                      <InputAdornment position="end">
                                                          {translateButton}
                                                      </InputAdornment>
                                              }}
                                              helperText={this.state.fieldErrors[fieldKey]}
                                              fullWidth={field.fullWidth}
                                              type={isDateOrTime && field.multi?'text':uitype}
                                              multiline={uitype === 'textarea'}
                                              placeholder={field.placeholder}
                                              value={value || field.defaultValue || ''}
                                              name={fieldKey}
                                              onKeyDown={(e) => {
                                                  onKeyDown && onKeyDown(e, value)
                                              }}
                                              onPaste={(e)=>{
                                                if(field.type==='Float') {
                                                    // remove thousand separators
                                                    const value = e.clipboardData.getData('text/plain').replace(/’/g, '')
                                                    this.handleInputChange({target:{value, name: fieldKey}})
                                                    e.preventDefault()
                                                }
                                              }}
                                              onBlur={this.handleBlur}
                                              onChange={this.handleInputChange}/>)


        }

        if (field.divider) {
            currentFormFields.push(<Divider key={'divider' + field.name}/>)
        }

        if (!langButtonWasInserted && translateButton && languageCode === _app_.lang) {
            currentFormFields.splice(currentFormFields.length - 1, 0, <div key={'tr' + fieldKey}
                                                                           className={classes.translationAbsolute}>{translateButton}</div>)
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

GenericForm.propTypes = {
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
