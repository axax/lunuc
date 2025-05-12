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
    DeleteIcon,
    ExpandLessIconButton,
    ExpandMoreIconButton,
    TranslateIconButton,
    AutoFixHighIconButton,
    Tooltip
} from 'ui/admin'
import FileDrop from './FileDrop'
import TypePicker from './TypePicker'
import config from 'gen/config-client'
import TinyEditor from './TinyEditor'
import {checkFieldType} from 'util/typesAdmin.mjs'
import Hook from '../../util/hook.cjs'
import Expandable from 'client/components/Expandable'
import {_t} from '../../util/i18n.mjs'
import Util from '../util/index.mjs'
import DomUtil from '../util/dom.mjs'
import {isString, matchExpr, parseOrElse, propertyByPath, setPropertyByPath} from '../util/json.mjs'
import JsonEditor from '../../extensions/cms/components/JsonEditor'
import {Query} from '../middleware/graphql'
import {getTypeQueries, getTypes} from 'util/types.mjs'
import Async from './Async'
import styled from '@emotion/styled'
import theme from './ui/impl/material/theme'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import {showTooltip, hideTooltip} from '../util/tooltip'
import {translateText} from '../util/translate.mjs'
import {QUERY_KEY_VALUES_GLOBAL} from '../util/keyvalue'
import {replacePlaceholders} from '../../util/placeholders.mjs'

const CodeEditor = (props) => <Async {...props} load={import(/* webpackChunkName: "codeeditor" */ './CodeEditor')}/>


const StyledTabContainer = styled('div')(({ theme }) => ({
    backgroundColor: theme.palette.background.paper
}))

const getSxProps = field => ({
    margin: 1,
    width: 'calc(100% - ' + theme.spacing(2) + ')',
    ...(!field.fullWidth && {
        [theme.breakpoints.up('md')]: {
            width: `calc(${field.twoThirdWidth?'66.66':field.fourthWidth?'25':field.thirdWidth?'33.33':'50'}% - ${theme.spacing(2)})`
        }
    })
})


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

function convertFieldValueToDate(value, field) {
    if (value === 0 || value === null || value === undefined) {
        value = ''
    } else if (!field.multi) {
        try {
            value = new Date(value.constructor === String && !isNaN(value) ? parseFloat(value) : value).toISOString()
        } catch (e) {
            console.log(e, value)
            if (!field.required) {
                value = ''
            }
        }
    }
    return value;
}

function convertArrayToObjectByAttr(subFields, attrName) {
    if (Array.isArray(subFields)) {
        return subFields.reduce((acc, cur, i) => {
            acc[cur[attrName]] = cur
            return acc
        }, {})
    }
    return subFields
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
            fieldsTmp: {},
            fieldsDirty: {}, /* only set when fields has changed */
            valuesOri: props.values,
            showTranslations: prevState.showTranslations || {},
            tabValue: prevState.tabValue ? prevState.tabValue : 0
        }

        Object.keys(props.fields).map(fieldKey => {
            const field = props.fields[fieldKey]
            if (!field) {
                return
            }
            let fieldValue
            if (field.localized) {
                fieldValue = {_localized:true}
                if (props.values && props.values[fieldKey]) {
                    if (props.values[fieldKey].constructor === String) {
                        fieldValue[config.DEFAULT_LANGUAGE] = props.values[fieldKey]
                    } else {
                        Object.assign(fieldValue, props.values[fieldKey])
                    }
                } else {
                    if(field.value && (!props.values || field.localizedFallback)) {
                        if (field.value.__typename || Array.isArray(field.value) || isString(field.value)) {
                            // fallback case if attribute is not localized yet
                            fieldValue[config.DEFAULT_LANGUAGE] = field.value
                        } else{
                            config.LANGUAGES.forEach(lang => {
                                fieldValue[lang] = field.value[lang]
                            })
                        }
                    }else{
                        fieldValue = null
                    }
                }
            } else {
                if (props.values) {
                    if (field.type === 'Object' && props.values[fieldKey] && props.values[fieldKey].constructor === Object) {
                        fieldValue = Object.assign({}, props.values[fieldKey])
                    } else {
                        fieldValue = props.values[fieldKey]
                    }
                } else if(field.defaultValue && field.value === undefined){
                    fieldValue = field.defaultValue
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
            if ((field.required || field.validatePattern) && (!field.uistate || !field.uistate.visible || !matchExpr(field.uistate.visible, state.fields))) {

                if(field.validatePattern){

                    if(!state.fields[fieldKey]){
                        if(field.required){
                            fieldErrors[fieldKey] = _t('GenericForm.fieldIsRequired')
                        }
                    }else {
                        const reg = new RegExp(field.validatePattern)
                        if (!reg.test(state.fields[fieldKey])) {
                            fieldErrors[fieldKey] = _t('GenericForm.fieldIsInvalid', {pattern: field.validatePattern})
                        }
                    }
                }else if(field.uitype==='select'){
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
                                state.showTranslations[fieldKey] = true
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
            if (validationState && !validationState.fieldErrors) {
                validationState.fieldErrors = {}
            }
        } else {
            validationState = {isValid: true, fieldErrors}
        }
        if (validationState && !validationState.isValid && tabs.length > 0 && options.changeTab) {
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

        return validationState || {isValid: false, fieldErrors}
    }

    reset() {
        this.setState(GenericForm.getInitalState(this.props))
    }


    shouldComponentUpdate(props, state) {
        return state !== this.state || state.fieldErrors !== this.state.fieldErrors || state.showTranslations !== this.state.showTranslations
    }


    componentWillUnmount() {
        if (this._colorPickers) {
            Object.keys(this._colorPickers).forEach(key=>{
                this._colorPickers[key].destroy()
                delete this._colorPickers[key]
            })
        }
    }

    componentDidMount() {
        if (this.props.onRef)
            this.props.onRef(this)
    }

    validate(state = this.state, updateState = true, options) {

        const validationState = GenericForm.staticValidate(state, this.props, options)

        if(this._triggerErrors){
            validationState.fieldErrors = Object.assign({},validationState.fieldErrors,this._triggerErrors)
            validationState.isValid = false
        }

        if (updateState) {
            this.setState(validationState)
        }
        return validationState
    }

    loadFlatpickr() {

        DomUtil.addScript('/flatpickr.min.js', {
            id: 'flatpickrJs',
            onload: () => {
                DomUtil.addScript('/flatpickr-de.js', {
                    id: 'flatpickrJsDe',
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
                                dateFormat: 'Z'
                            })
                        }

                    })

                }).catch(()=>{})

            },50)

        }

    }

   /* loadColorpicker(id) {
        if(!this._colorPickerLoaded) {
            this._colorPickerLoaded = true
            DomUtil.addScript('https://cdn.jsdelivr.net/npm/@simonwep/pickr/dist/pickr.min.js', {
                id: 'colorpicker',
                onload: () => {
                    this.initColorpicker(id)
                }
            }, {ignoreIfExist: true})

            DomUtil.addStyle('https://cdn.jsdelivr.net/npm/@simonwep/pickr/dist/themes/classic.min.css', {id: 'colorpickerstyle'}, {ignoreIfExist: true})
        }else{
            this.initColorpicker(id)
        }
    }

    initColorpicker(id) {
        if(!this._colorPickers){
            this._colorPickers = {}
        }

        if(this._colorPickers[id]){
            return
        }

        DomUtil.waitForVariable('Pickr').then(()=>{

            this._colorPickers[id] = new Pickr({
                el: `input#${id}`,
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
            this._colorPickers[id].on('change', (color, type, instance) => {
                const inp = instance._root.button
                clearTimeout(timeout)
                timeout = setTimeout(() => {
                    this.handleInputChange({target: {name: inp.name, value: color.toHEXA().toString()}})
                }, 300)
            }).on('show', (color, instance) => {
                const inp = instance._root.button
                this._colorPickers[id].setColor(inp.value)
            })

        })
    }*/

    newStateForField(prevState, {name, value, originalValue, localized}) {
        const newState = Object.assign({}, {fields: {}, fieldsDirty:{}}, prevState)

        // for localization --> name.de / name.en
        if (localized) {
            const path = name.split('.'),
                field = prevState.fieldsOri[path[0]]
            const currentVal = newState.fields[path[0]]
            if (!currentVal || currentVal.constructor !== Object) {
                newState.fields[path[0]] = currentVal && currentVal.constructor === String ? {[config.DEFAULT_LANGUAGE]:currentVal} : {}
            }
            newState.fields[path[0]][path[1]] = value
            newState.fields[path[0]]._localized = true

            if(field.localizedFallback){
                const localizedField = Object.assign({}, newState.fields[path[0]])
                delete localizedField._localized

                const values = Object.values(localizedField)
                const allEqual = values.length<=1 || values.every( v => !v ||
                    (v.constructor===Array && v.length===0) ||
                    JSON.stringify(v) === JSON.stringify(values[0]))
                if(allEqual){
                    newState.fields[path[0]] = values.length>0?values[0]:null
                }
            }
        } else {
            newState.fields[name] = value
            if(value !== originalValue){
                newState.fieldsTmp[name] = originalValue
            }
        }

        newState.fieldsDirty[name]=newState.fields[name]
        return newState
    }

    handleInputChange = async (e) => {
        const {fields, trigger} = this.props
        const target = e.target, name = target.name
        const originalValue = target.type === 'checkbox' ? target.checked : target.value
        let value = originalValue
        if (fields[name]) {
            value = checkFieldType(originalValue, fields[name])
        }

        const newState = this.newStateForField(this.state, {
            name,
            value,
            originalValue,
            localized: target.dataset && !!target.dataset.language
        })

        let updateState = false
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

                    const promiseResult = await new Promise(resolve => {

                        const result = new Function(`
                                const data = (async () => {
                                    try{
                                        ${script}
                                    }catch(error){
                                        this.resolve({error})
                                    }
                                })()
                                this.resolve({data})`).call({
                            state: newState,
                            __this:this,
                            name,
                            target,
                            resolve,
                            prevState: this.state,
                            Util,
                            rawValue: e.rawValue,
                            props: this.props
                        })

                        return result
                    })

                    const finalResult = await promiseResult.data

                    updateState = !!finalResult
                } catch (e) {
                    console.log('Error in trigger', e)
                }
            }
        }
        if (this.props.onChange) {
            this.props.onChange({name, value, target})
        }
        const formValidation = this.validate(newState, updateState)
        this.setState(Object.assign(newState, formValidation))
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
        const {fields, primaryButton, caption, subForm} = this.props
        const fieldKeys = Object.keys(fields), formFields = [], tabs = [], formFieldsNoTabs = []

        let expandableField, expandableData, datePolyfill = false
        for (let fieldIndex = 0; fieldIndex < fieldKeys.length; fieldIndex++) {
            const fieldKey = fieldKeys[fieldIndex],
                field = fields[fieldKey]


            if (!field || field.invisible) {
                continue
            }


            if ((field.role && !Util.hasCapability(_app_.user, field.role)) ||
                (field.uistate && field.uistate.visible && matchExpr(field.uistate.visible, this.state.fields)) ||
                (field.access && field.access.ui && field.access.ui.role && !Util.hasCapability(_app_.user, field.access.ui.role))
            ){
                continue
            }

            let value = this.state.fieldsTmp[fieldKey] || this.state.fields[fieldKey]
            if (field.replaceBreaks && value) {
                value = value.replace(/<br>/g, '\n')
            }
            if (field.uitype === 'date' || field.uitype === 'datetime') {
                //iso date without ms
                value = convertFieldValueToDate(value, field)
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

            } else if(field.noTab) {
                currentFormFields = formFieldsNoTabs
            }

            if (field.autoIncrement && !value) {
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
                    }
                })
            }

            if (field.newLine) {
                currentFormFields.push(<br key={'br' + fieldKey}/>)
            }
            const uitype = field.uitype || (field.enum ? 'select' : 'text')

            if(field.dynamicSubFields){
                const keys = JSON.parse(replacePlaceholders(field.dynamicSubFields,{user:_app_.user}))
                if(keys?.length>0) {
                    currentFormFields.push(<Query key="query" query={QUERY_KEY_VALUES_GLOBAL}
                                                  variables={{keys}}
                                                  fetchPolicy="cache-and-network">
                        {({loading, error, data}) => {
                            if (loading) return 'Loading...'
                            if (error) return `Error! ${error.message}`
                            const dynamicFormFieldResponse = []
                            const dynamicFormFields = []
                            data.keyValueGlobals.results.forEach(kv=>{
                                const v = JSON.parse(kv.value)
                                dynamicFormFields.push(...v)
                            })
                            this.renderSubFields(field, value, fieldKey, dynamicFormFieldResponse, dynamicFormFields)
                            return dynamicFormFieldResponse
                        }}
                    </Query>)
                }else{
                    this.renderSubFields(field, value, fieldKey, currentFormFields)
                }
            }else if (field.subFields) {
                this.renderSubFields(field, value, fieldKey, currentFormFields)
            }


            if (field.localized) {
                const showTranslations = this.state.showTranslations[fieldKey]
                const valueDefaultlanguage = value ? value.constructor===String?value:value[config.DEFAULT_LANGUAGE]:''
                const translateButton = config.LANGUAGES.length > 1 && <>
                {valueDefaultlanguage && uitype!=='type_picker' && <Tooltip title={_t('GenericFrom.autoTranslate')} key={fieldKey + "tooltip1"}>
                    <AutoFixHighIconButton key={fieldKey + "autoTranslate"}
                                     onClick={() => {
                                         config.LANGUAGES.forEach(lang => {
                                             if (!value[lang] && lang !== config.DEFAULT_LANGUAGE) {
                                                 translateText({text: valueDefaultlanguage, toIso:lang, fromIso: config.DEFAULT_LANGUAGE}).then(({text,toIso}) => {
                                                     this.handleInputChange({
                                                         target: {
                                                             dataset: {
                                                                 language: toIso
                                                             },
                                                             name: `${fieldKey}.${toIso}`,
                                                             value: text
                                                         }
                                                     })
                                                 })
                                             }
                                         })
                                     }}>
                    </AutoFixHighIconButton>
                </Tooltip>}
                <Tooltip title={_t('GenericFrom.translation')} key={fieldKey + "tooltip2"}>
                    <TranslateIconButton key={fieldKey + "translation"}
                     onClick={() => {
                         this.setState({showTranslations: Object.assign({}, this.state.showTranslations, {[fieldKey]: !showTranslations})})
                     }}>
                    </TranslateIconButton>
                </Tooltip>
                </>


                config.LANGUAGES.forEach(languageCode => {
                    const fieldKeyTr = fieldKey + '.' + languageCode
                    if (languageCode === _app_.lang || showTranslations) {
                        this.createInputField({
                            uitype,
                            field,
                            value: value && value[languageCode] ? value[languageCode] :
                                (field.localizedFallback && value && value.constructor === String && config.DEFAULT_LANGUAGE===languageCode ? value:''),
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
            <Wrapper style={this.props.style}>
                {tabs.length === 0 && formFields}
                {formFieldsNoTabs.length > 0 && formFieldsNoTabs}
                {tabs.length > 0 && <StyledTabContainer>
                    <SimpleTabs
                        style={{width:'100%'}}
                        value={tabValue}
                        onChange={(e, newValue) => {
                            this.setState({tabValue: newValue})
                        }}
                    >
                        {tabs.map((tab, i) =>
                            <SimpleTab key={'tab-' + i} label={_t(tab.name)}/>
                        )}

                        {formFields.length > 0 &&
                        <SimpleTab key={'tab-' + tabs.length} label={_t('GenericForm.moreOptions')}/>}

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

                </StyledTabContainer>}
                {primaryButton != false ?
                    <Button color="primary" variant="contained" disabled={!this.state.isValid}
                            onClick={this.onAddClick}>{caption || 'Add'}</Button>
                    : ''}
            </Wrapper>
        )
    }

    renderSubFields(field, value, fieldKey, currentFormFields, extraFields) {
        const subFields = {...convertArrayToObjectByAttr(field.subFields, 'name'),...convertArrayToObjectByAttr(extraFields, 'name')}

        if (field.multi) {

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
                    title = Util.replacePlaceholders(field.titleTemplate, {_index: index, ...values})
                } else {
                    Object.keys(values).map(k => {
                        if (title && values[k]) {
                            title += ' / '
                        }
                        title += values[k] || ''
                    })
                }

                const expandedKey = `expanded-${field.name}-${fieldKey}`
                currentFormFields.push(
                    <Expandable title={title}
                                draggable={true}
                                index={index}
                                passThrough={field.accordion === false}
                                key={expandedKey}
                                onPositionChange={(sourceIndex, targetIndex) => {
                                    const newValue = subFieldValues.slice(0),
                                        element = newValue.splice(sourceIndex, 1) [0]

                                    newValue.splice(targetIndex, 0, element)

                                    this.handleInputChange({
                                        target: {
                                            name: fieldKey,
                                            value: newValue
                                        }
                                    })
                                }}
                                onChange={(e) => {
                                    this.setState({[expandedKey]: valueFieldKey})
                                }}
                                expanded={this.state[expandedKey] === valueFieldKey}>
                        <GenericForm onChange={(e) => {
                            const subField = subFields[e.name.split('.')[0]]

                            setPropertyByPath(e.value, e.name, values)

                            if (subField.localized) {
                                // mark as localized
                                values[subField.name]._localized = true
                            }


                            this.handleInputChange({
                                target: {
                                    name: fieldKey,
                                    value: subFieldValues
                                }
                            })

                        }} primaryButton={false} values={values} updateOnValueChange={true} key={valueFieldKey}
                                     subForm={true}
                                     fields={subFields}/>
                        <Button key={'delete' + valueFieldKey}
                                color="error"
                                size="small"
                                startIcon={<DeleteIcon/>}
                                onClick={() => {
                                    subFieldValues.splice(index, 1)
                                    this.handleInputChange({
                                        target: {
                                            name: fieldKey,
                                            value: subFieldValues
                                        }
                                    })
                                }}
                                variant="contained">{_t('GenericForm.delete')}</Button>
                        <Button key={'clone' + valueFieldKey}
                                color="secondary"
                                startIcon={<ContentCopyIcon/>}
                                size="small"
                                onClick={() => {
                                    const clone = Object.assign({}, subFieldValues[index])
                                    subFieldValues.push(clone)
                                    this.handleInputChange({
                                        target: {
                                            name: fieldKey,
                                            value: subFieldValues
                                        }
                                    })
                                }}
                                variant="contained">{_t('GenericForm.clone')}</Button>

                    </Expandable>)
            })
            currentFormFields.push(<Button key={fieldKey}
                                           color={field.addButtonColor || 'primary'}
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


            let values, wasString = isString(value)
            if (wasString) {
                values = parseOrElse(value, {})
            } else {
                values = value || {}
            }

            currentFormFields.push(<GenericForm onChange={(e) => {
                values[e.name] = e.value
                this.handleInputChange({
                    target: {
                        name: fieldKey,
                        value: wasString ? JSON.stringify(values) : values
                    }
                })

            }} primaryButton={false} values={values} updateOnValueChange={true} key={fieldKey} subForm={true}
                                                fields={subFields}/>)

        }


        currentFormFields.push(<br key={'brMeta' + fieldKey}/>)
    }


    createInputField({uitype, field, value, currentFormFields, fieldKey, fieldIndex, languageCode, translateButton}) {
        const {onKeyDown, autoFocus} = this.props
        let langButtonWasInserted = false
        if (!field.label) {
            field.label = ''
        }

        if (field.description) {
            currentFormFields.push(<p>{field.description}</p>)
        }
        if(uitype==='timestamp') {
            currentFormFields.push(<><Button key={fieldKey}
                                           className={field.className}
                                           color="primary"
                                           variant="contained"
                                           style={field.style}
                                           onClick={() => {
                                               this.handleInputChange({
                                                   target: {
                                                       name: fieldKey,
                                                       value: new Date().getTime()
                                                   }
                                               })
                                           }}>{field.label}</Button><small>{value?Util.formattedDatetime(value):''}</small></>)

        }else if (uitype === 'htmlParser') {
            let html
            if(field.replacePlaceholders){
                html =  Util.replacePlaceholders(field.html, {data:this.state.fields, Util})
            }else{
                html = field.html
            }

            currentFormFields.push(<span className={field.className} dangerouslySetInnerHTML={{__html: html}}/>)

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
                                                className={field.className}
                                                sx={getSxProps({fullWidth:true})}>
                <InputLabel key={'label' + fieldKey}
                            onMouseEnter={(e)=>{
                                if(field.label && field.name && field.label !== field.name) {
                                    showTooltip(field.name, e)
                                }
                            }}
                            onMouseLeave={()=>{
                                hideTooltip()
                            }}
                            shrink>{field.label + (languageCode ? ' [' + languageCode + ']' : '')}</InputLabel>

                {uitype == 'jsonEditor' ? <JsonEditor onChange={(newValue) => this.handleInputChange({
                        target: {
                            dataset: {
                                language: languageCode
                            },
                            name: fieldKey,
                            value: newValue
                        }
                    })} componentTemplate={field.componentTemplate} propertyTemplate={field.propertyTemplate}>{value}</JsonEditor> :

                    <CodeEditor
                        style={{border: '1px solid #eeeeee',margin: '24px 0'}}
                        readOnly={field.readOnly}
                        key={fieldKey}
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


            currentFormFields.push(<FormControl style={{zIndex: 1}}
                                                key={'control' + fieldKey}
                                                className={field.className}
                                                sx={getSxProps({fullWidth:true})}>
                <InputLabel key={'label' + fieldKey}
                            onMouseEnter={(e)=>{
                                if(field.label && field.name && field.label !== field.name) {
                                    showTooltip(field.name, e)
                                }
                            }}
                            onMouseLeave={()=>{
                                hideTooltip()
                            }}
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
                                           className={field.className}
                                           color="primary"
                                           variant="contained"
                                           style={field.style}
                                           onClick={() => {
                                               if (this.props.onButtonClick)
                                                   this.props.onButtonClick(field)
                                           }}>{field.label}</Button>)


        } else if (uitype === 'image') {

            currentFormFields.push(<FileDrop key={fieldKey} className={field.className} value={value}/>)


       /* } else if (uitype === 'color_picker') {

            currentFormFields.push(<FormControl key={'control' + fieldKey}
                                                className={field.className}
                                                sx={getSxProps({fullWidth:true})}>
                <InputLabel key={'label' + fieldKey} shrink>{field.label}</InputLabel><Input data-colorpicker=""
                                                                                             onChange={this.handleInputChange}
                                                                                             name={fieldKey}
                                                                                             key={fieldKey}
                                                                                             id={fieldKey}
                                                                                             value={value}/></FormControl>)

            this.loadColorpicker(fieldKey)*/


        } else if (uitype === 'type_picker') {
            currentFormFields.push(<TypePicker
                className={field.className}
                keepTextValue={field.keepTextValue}
                showAlwaysAsImage={field.showAlwaysAsImage}
                value={(value ? (value.constructor === Array ? value : [value]) : null)}
                dataset={{
                    'language': languageCode
                }}
                InputLabelProps={{
                    shrink: true,
                    onMouseEnter:e=>{
                        if(field.label && field.name && field.label !== field.name) {
                            showTooltip(field.name, e)
                        }
                    },
                    onMouseLeave:()=>{
                        hideTooltip()
                    }
                }}
                error={!!this.state.fieldErrors[fieldKey]}
                helperText={this.state.fieldErrors[fieldKey]}
                onChange={this.handleInputChange}
                sx={getSxProps(field)}
                fullWidth={field.fullWidth}
                fileImport={field.fileImport}
                key={fieldKey}
                name={fieldKey}
                label={_t(field.label)+ (languageCode ? ' [' + languageCode + ']' : '')}
                readOnly={field.readOnly}
                genericType={field.genericType}
                filter={field.filter?Util.replacePlaceholders(field.filter, this.state):''}
                linkTemplate={field.linkTemplate}
                multi={field.multi}
                pickerField={field.pickerField} /* fields that are searched */
                searchFields={field.searchFields} /* fields that are shown in the picker */
                projection={field.projection} /* fields that are projected and returned */
                metaFields={field.metaFields} /* fields that need user input and are returned in addtion */
                queryFields={field.queryFields || field.fields}
                pickerSort={field.pickerSort}
                type={field.type}
                placeholder={field.placeholder}/>)
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
                            className={field.className}
                            readOnly={field.readOnly}
                            key={fieldKey} name={fieldKey}
                            onChange={this.handleInputChange}
                            items={items}
                            error={!!this.state.fieldErrors[fieldKey]}
                            hint={this.state.fieldErrors[fieldKey]}
                            multi={field.multi}
                            label={field.label}
                            sx={getSxProps(field)}
                            InputLabelProps={{
                                shrink: true,
                                onMouseEnter:e=>{
                                    if(field.label && field.name && field.label !== field.name) {
                                        showTooltip(field.name, e)
                                    }
                                },
                                onMouseLeave:()=>{
                                    hideTooltip()
                                }
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
                if(field.enum==='$TYPES'){
                    field.enum = Object.keys(getTypes())
                }

                value = matchObjectValueFromList(value, field, field.enum)

                currentFormFields.push(<SimpleSelect
                    readOnly={field.readOnly}
                    className={field.className}
                    key={fieldKey}
                    name={fieldKey}
                    onChange={this.handleInputChange}
                    items={field.enum}
                    error={!!this.state.fieldErrors[fieldKey]}
                    hint={this.state.fieldErrors[fieldKey]}
                    multi={field.multi}
                    label={field.label}
                    sx={getSxProps(field)}
                    InputLabelProps={{
                        shrink: true,
                        onMouseEnter:e=>{
                            if(field.label && field.name && field.label !== field.name) {
                                showTooltip(field.name, e)
                            }
                        },
                        onMouseLeave:()=>{
                            hideTooltip()
                        }
                    }}
                    value={value}/>)
            }


        } else if (field.type === 'Boolean') {
            currentFormFields.push(<SimpleSwitch key={fieldKey}
                                                 readOnly={field.readOnly}
                                                 label={field.label || field.placeholder}
                                                 name={fieldKey}
                                                 className={field.className}
                                                 sx={getSxProps(field)}
                                                 onChange={this.handleInputChange}
                                                 checked={value ? true : false}/>)


        } else {

            const result = {}

            Hook.call('GenericFormField', {field, fieldKey, result, value, languageCode}, this)

            if (result.component) {
                currentFormFields.push(result.component)
                return true
            }

            const isDateOrTime = uitype==='date' || uitype==='datetime'

            langButtonWasInserted = true
            currentFormFields.push(<TextField autoFocus={autoFocus && fieldIndex === 0}
                                              error={!!this.state.fieldErrors[fieldKey]}
                                              key={fieldKey}
                                              id={fieldKey}
                                              className={field.className}
                                              label={(field.label || field.name) + (languageCode ? ' [' + languageCode + ']' : '')}
                                              sx={getSxProps(field)}
                                              InputLabelProps={{
                                                  shrink: true,
                                                  onMouseEnter:e=>{
                                                      if(field.label && field.name && field.label !== field.name) {
                                                          showTooltip(field.name, e)
                                                      }
                                                  },
                                                  onMouseLeave:()=>{
                                                      hideTooltip()
                                                  }
                                              }}
                                              inputProps={{
                                                  readOnly: field.readOnly,
                                                  step: field.step || '',
                                                  min: field.min || '',
                                                  max: field.max || '',
                                                  'data-language': languageCode,
                                                  'data-datetime-field': isDateOrTime
                                              }}
                                              InputProps={{
                                                  endAdornment: languageCode === _app_.lang &&
                                                      <InputAdornment position="end">
                                                          {translateButton}
                                                      </InputAdornment>
                                              }}
                                              helperText={this.state.fieldErrors[fieldKey]||(field.helperText?Util.replacePlaceholders(field.helperText, this.state.fields):'')}
                                              fullWidth={field.fullWidth}
                                              type={isDateOrTime?'text':uitype}
                                              multiline={uitype === 'textarea'}
                                              placeholder={field.placeholder}
                                              value={value===0 && field.type==='Float'?0:value || field.defaultValue || ''}
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
            currentFormFields.push(<Divider className={field.className} key={'divider' + field.name}/>)
        }

        if (field.extraAfter) {
            currentFormFields.push(field.extraAfter)
        }

        if (!langButtonWasInserted && translateButton && languageCode === _app_.lang) {
            currentFormFields.splice(currentFormFields.length - 1, 0, <div key={'tr' + fieldKey}
                                                                           style={{right: '3.55rem',
                                                                               marginTop: '-0.5rem',
                                                                               position: 'absolute',
                                                                               zIndex: 2}}>{translateButton}</div>)
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
    autoFocus: PropTypes.bool
}

export default GenericForm
