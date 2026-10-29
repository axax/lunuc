import React from 'react'
import {createPortal} from 'react-dom'
import {
    Divider,
    Button,
    TextField,
    Slider,
    Typography,
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
import ImageCropper from './ImageCropper'
import config from 'gen/config-client'
import TinyEditor from './TinyEditor'
import {checkFieldType} from 'util/typesAdmin.mjs'
import Hook from '../../util/hook.cjs'
import Expandable from 'client/components/Expandable'
import {getImageSrc} from 'client/util/media'
import {_t} from '../../util/i18n.mjs'
import Util from '../util/index.mjs'
import DomUtil from '../util/dom.mjs'
import {isString, matchExpr, parseOrElse, propertyByPath, setPropertyByPath} from '../util/json.mjs'
import {isFieldVisibleForCurrentUser} from '../util/user.mjs'
import JsonEditor from '../../extensions/cms/components/JsonEditor'
import {Query} from '../middleware/graphql'
import {getTypeQueries, getTypes} from 'util/types.mjs'
import Async from './Async'
import styled from '@emotion/styled'
import { useTheme } from '@mui/material/styles'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import AddIcon from '@mui/icons-material/Add'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import IconButton from '@mui/material/IconButton'
import {showTooltip, hideTooltip} from '../util/tooltip'
import {translateText} from '../util/translate.mjs'
import {convertRawValuesFromPicker, openTypePickerWindow} from '../util/picker'
import {QUERY_KEY_VALUES_GLOBAL} from '../util/keyvalue'
import {replacePlaceholders} from '../../util/placeholders.mjs'
import {SimpleAutosuggest} from './ui/impl/material'
import { CAPABILITY_MANAGE_TYPES} from '../../util/capabilities.mjs'
import CmsViewContainer from '../../extensions/cms/containers/CmsViewContainer'
import CmsElement from '../../extensions/cms/components/CmsElement'
import ResizeHandle from './ResizeHandle'
import CmsTemplatePicker from '../../extensions/cms/components/CmsTemplatePicker'
import CmsContentImport, {addElementsToTemplate} from '../../extensions/cms/components/CmsContentImport'
import {loadEditorStyles} from '../../extensions/cms/util/editorStyles'
import {
    DEFAULT_STYLE_EDITOR, DEFAULT_STYLE_ENVIRONMENT,
    DEFAULT_TEMPLATE_MINIMAL
} from '../../extensions/cms/constants/cmsDefaults.mjs'

/*
 CmsEditor field with the styles of other cms pages, so the content is shown as on the page.
 Field options: editorStyleSlugs (slug or list of slugs of cms pages whose style is loaded),
 editorClassName (class name or list of class names for nested wrappers), editorStyle (additional css).
 The styles are scoped to the editor canvas and do not affect the admin.
 */
const CmsEditorWithStyles = ({fieldKey, field, children}) => {
    const slugs = [].concat(field.editorStyleSlugs || []).filter(Boolean)
    const hasStyles = slugs.length > 0 || !!field.editorStyle
    const scopeClass = 'cms-editor-scope-' + String(fieldKey).replace(/[^a-zA-Z0-9_-]/g, '_')
    const [styles, setStyles] = React.useState(hasStyles ? null : {imports: '', css: ''})
    const configKey = JSON.stringify([slugs, field.editorStyle || ''])
    React.useEffect(() => {
        if (!hasStyles) {
            return
        }
        let active = true
        loadEditorStyles({slugs, extraStyle: field.editorStyle, scope: '.' + scopeClass}).then(result => {
            if (active) setStyles(result)
        })
        return () => {
            active = false
        }
    }, [configKey])
    if (!styles) {
        return <div style={{padding: '1rem', opacity: 0.6}}>{_t('GenericForm.loading', null, 'Loading...')}</div>
    }
    const content = children(styles)
    if (!hasStyles) {
        return content
    }
    // editorClassName: a class name or a list of class names for nested wrappers (outermost first),
    // e.g. ["page", "jb", "jb-content"] for selectors like ".page .jb .jb-content p"
    const wrapped = [].concat(field.editorClassName || []).filter(Boolean).reduceRight(
        (inner, className) => <div className={className}>{inner}</div>, content)
    return <div className={scopeClass}>{wrapped}</div>
}

const CodeEditor = (props) => <Async {...props} load={() =>import(/* webpackChunkName: "codeeditor" */ './CodeEditor')}/>
// color picker field (uitype color_picker): own chunk, only loaded when such a field is rendered
const ColorPicker = (props) => <Async {...props} asyncKey="colorpicker" load={() => import(/* webpackChunkName: "colorpicker" */ './ColorPicker')}/>


// plain tabs: small labels, thin underline, colors from the theme.
// Selectors are nested on purpose so they win over the default SimpleTab styles.
// preset values of a text field (field.presets), e.g. small / medium / large for a margin
const StyledPresets = styled('span')({
    display: 'inline-flex',
    gap: '2px',
    marginRight: '-6px'
})
const StyledPreset = styled('button')(({theme}) => ({
    minWidth: '1.6rem',
    height: '1.5rem',
    padding: '0 0.3rem',
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: '4px',
    background: 'transparent',
    color: theme.palette.text.secondary,
    font: 'inherit',
    fontSize: '0.7rem',
    fontWeight: 600,
    lineHeight: 1,
    cursor: 'pointer',
    '&:hover': {
        borderColor: theme.palette.primary.main,
        color: theme.palette.primary.main
    },
    '&[data-active="true"]': {
        background: theme.palette.primary.main,
        borderColor: theme.palette.primary.main,
        color: theme.palette.primary.contrastText
    }
}))

const StyledTabContainer = styled('div')(({ theme }) => ({
    backgroundColor: theme.palette.background.paper,
    '& .MuiTabs-root': {
        minHeight: 36,
        borderBottom: `1px solid ${theme.palette.divider}`,
        borderRight: 'none'
    },
    '& .MuiTabs-root .MuiTabs-indicator': {
        height: 2,
        borderRadius: '2px 2px 0 0',
        backgroundColor: theme.palette.primary.main
    },
    '& .MuiTabs-root .MuiTab-root': {
        minHeight: 36,
        minWidth: 0,
        padding: '6px 12px',
        marginRight: 0,
        fontFamily: 'inherit',
        fontSize: '0.875rem',
        fontWeight: theme.typography.fontWeightRegular,
        textTransform: 'none',
        color: theme.palette.text.secondary,
        transition: 'color .15s'
    },
    '& .MuiTabs-root .MuiTab-root:hover': {
        color: theme.palette.text.primary
    },
    '& .MuiTabs-root .MuiTab-root.Mui-selected': {
        color: theme.palette.text.primary,
        fontWeight: theme.typography.fontWeightMedium
    },
    '& .MuiTabs-root .MuiTab-root.Mui-focusVisible': {
        backgroundColor: 'transparent',
        outline: `2px solid ${theme.palette.primary.main}`,
        outlineOffset: -2,
        borderRadius: 4
    },
    '& .MuiTabs-scrollButtons': {
        width: 28
    },
    '& .MuiTabs-scrollButtons.Mui-disabled': {
        opacity: 0.3
    }
}))

// the form fields bring their own margin, so the panel only needs a little space below the tabs
const TAB_PANEL_SX = {mt: 2, minHeight: '100%'}

const StyledCmsEditorFrame = styled('div')(({theme}) => ({
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    [theme.breakpoints.up('md')]: {
        flexDirection: 'row'
    },
    padding: '10px',
    borderRadius: '12px',
    border: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.action.hover,
    // dotted canvas so the area reads as a surface, not as an input
    backgroundImage: `radial-gradient(circle, ${theme.palette.divider} 1px, transparent 1px)`,
    backgroundSize: '14px 14px'
}))

const StyledCmsEditorCanvas = styled('div')(({theme}) => ({
    flex: 1,
    minWidth: 0,
    minHeight: '8rem',
    borderRadius: '8px',
    backgroundColor: theme.palette.background.paper,
    boxShadow: theme.shadows[1],
    // room for the editor chrome: drag bar (-8px), context menu (-2.45rem)
    // and the action bar above the element
    padding: '1rem'
}))

// element palette inside the editor frame (left of the canvas on desktop, above it on mobile)
const CMS_ELEMENTS_WIDTH_DEFAULT = 216, CMS_ELEMENTS_WIDTH_MIN = 140, CMS_ELEMENTS_WIDTH_MAX = 640
const CMS_ELEMENTS_WIDTH_KEY = 'GenericForm.cmsElementsWidth'

// width of the element palette, changed by dragging its right edge (stored per browser)
const loadCmsElementsWidth = () => {
    try {
        const w = parseInt(window.localStorage.getItem(CMS_ELEMENTS_WIDTH_KEY))
        if (w >= CMS_ELEMENTS_WIDTH_MIN && w <= CMS_ELEMENTS_WIDTH_MAX) return w
    } catch (e) {
    }
    return CMS_ELEMENTS_WIDTH_DEFAULT
}

// drag handle on the right edge of the palette (desktop only), just outside the panel in the gap to the canvas
const StyledCmsElementsResizer = styled(ResizeHandle)(({theme}) => ({
    display: 'none',
    [theme.breakpoints.up('md')]: {
        display: 'block',
        right: -8
    }
}))

const StyledCmsElementsPanel = styled('div', {
    shouldForwardProp: prop => prop !== 'collapsed' && prop !== 'panelWidth'
})(({theme, collapsed, panelWidth}) => ({
    flexShrink: 0,
    borderRadius: '8px',
    backgroundColor: theme.palette.background.paper,
    boxShadow: theme.shadows[1],
    [theme.breakpoints.up('md')]: {
        // stretch to the full height of the editor frame (the canvas decides the height)
        alignSelf: 'stretch',
        position: 'relative',
        // default: two dense tiles (2 x 96px) + padding + scrollbar, wider by dragging the right edge
        width: collapsed ? 40 : (panelWidth || CMS_ELEMENTS_WIDTH_DEFAULT),
        // keeps the palette usable while the canvas is still (almost) empty
        minHeight: collapsed ? 'auto' : '24rem'
    }
}))

// scroll area inside the panel: on desktop it is pinned to the panel, so the palette
// never makes the frame taller than the canvas but uses all of its height
const StyledCmsElementsScroll = styled('div')(({theme, collapsed}) => ({
    padding: '4px',
    overflowY: 'auto',
    maxHeight: collapsed ? 'none' : '14rem',
    [theme.breakpoints.up('md')]: {
        // stays in view while a long content is scrolled (sticky inside the stretched panel)
        position: collapsed ? 'static' : 'sticky',
        top: 8,
        // never higher than the panel (= height of the canvas) nor than the visible area
        maxHeight: collapsed ? 'none' : 'min(100%, calc(100vh - 13rem))'
    }
}))

const StyledCmsElementsHeader = styled('div')(({theme, collapsed}) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: collapsed ? 'center' : 'space-between',
    padding: collapsed ? 0 : '0 0 0 6px',
    color: theme.palette.text.secondary,
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em'
}))

const getSxProps = (field,theme) => {
    if (field.placement === 'header') {
        // field in the header of the dialog (see renderHeaderFields): only as wide as its content
        return {margin: 0, display: 'inline-flex', width: 'auto', verticalAlign: 'middle'}
    }
    return {
        margin: 1,
        display: 'inline-flex',
        width: 'calc(100% - ' + theme.spacing(2) + ')',
        ...(!field.fullWidth && {
            [theme.breakpoints.up('md')]: {
                // 4 per row only from lg on, on md they would be too narrow
                width: `calc(${field.twoThirdWidth ? '66.66' : field.thirdWidth ? '33.33' : '50'}% - ${theme.spacing(2)})`
            },
            ...(field.fourthWidth && {
                [theme.breakpoints.up('lg')]: {
                    width: `calc(25% - ${theme.spacing(2)})`
                }
            })
        })
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

/*
 * Tab names written as text in element definitions (e.g. "tab": "Erweitert" in a manual.md) and the tabs of the
 * system (translation keys) end up in the same tab, labelled in the language of the user. Without this the dialog
 * shows "Extended" and "Erweitert" side by side.
 */
const TAB_ALIASES = {
    'Erweitert': 'elements.extendedTab',
    'Extended': 'elements.extendedTab',
    'Allgemein': 'elements.generalTab',
    'General': 'elements.generalTab'
}
const tabName = tab => TAB_ALIASES[tab] || tab

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
            showTranslations: prevState && prevState.showTranslations ? prevState.showTranslations: {},
            tabValue: prevState && prevState.tabValue ? prevState.tabValue : 0
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
                    if (field.type === 'Object' && props.values[fieldKey]) {
                        if(props.values[fieldKey].constructor === Object) {
                            fieldValue = Object.assign({}, props.values[fieldKey])
                        }else if(Array.isArray(props.values[fieldKey])){
                            fieldValue = JSON.parse(JSON.stringify(props.values[fieldKey]))
                        }else{
                            fieldValue = props.values[fieldKey]
                        }
                    } else {
                        fieldValue = props.values[fieldKey]
                    }
                } else if(field.defaultValue!==undefined && field.value === undefined){
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
                if (tabs.indexOf(tabName(field.tab)) < 0) {
                    tabs.push(tabName(field.tab))
                }
            }
            if ((field.required || field.validatePattern) &&
                (!field.uistate || !field.uistate.visible || !matchExpr(field.uistate.visible, state.fields))) {

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
                    if (tabName(fields[key].tab) === tabs[state.tabValue]) {
                        foundTab = true
                        break
                    } else {
                        relevantTabs.push(tabs.indexOf(tabName(fields[key].tab)))
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
        this._isUnmounted = true
        clearTimeout(this._confirmDeleteTimeout)
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
        this.updateHeaderSlot()
    }

    componentDidUpdate() {
        this.updateHeaderSlot()
    }

    /*
     * Fields with placement: 'header' are rendered into an element with the attribute data-form-header-slot
     * in the dialog of the form (e.g. the title of the GenericData dialog). Without such an element they
     * are shown above the form.
     */
    updateHeaderSlot() {
        if (!this._hasHeaderFields || !this._rootRef) {
            return
        }
        const current = this.state.headerSlot
        if (current && current.isConnected) {
            return
        }
        const container = this._rootRef.closest('.MuiDialog-paper') || this._rootRef.parentElement
        const slot = (container && container.querySelector('[data-form-header-slot]')) || false
        if (slot !== (current || false)) {
            this.setState({headerSlot: slot})
        }
    }

    renderHeaderFields(headerFields) {
        if (headerFields.length === 0) {
            return null
        }
        const content = <span className="generic-form-header-fields"
                              style={{display: 'inline-flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
                                  fontSize: '1rem', fontWeight: 'normal', textAlign: 'left', verticalAlign: 'middle'}}>{headerFields}</span>
        if (this.state.headerSlot) {
            return createPortal(content, this.state.headerSlot)
        }
        return <div style={{display: 'flex', justifyContent: 'flex-end', marginBottom: 8}}>{content}</div>
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

    // url of the original image for the crop selection (value of the image picker field)
    getCropImageSrc = (raw) => {
        if (!raw) return ''
        if (!Array.isArray(raw) && typeof raw === 'object' && !raw._id && !raw.src) {
            // localized value {de: [...], en: [...]}
            const lang = _app_.lang
            raw = raw[lang] || raw[Object.keys(raw).find(k => k !== '_localized' && raw[k])]
            if (!raw) return ''
        }
        const src = Util.getImageObject(raw, {addParams: false}).src
        return src === '/placeholder.svg' ? '' : src
    }

    // after an image was picked: preset size (original width, max 1600px, same ratio), quality 90 and WebP.
    // Only for a fresh element (nothing set yet) and not for SVG, which would be converted to PNG.
    applyImageDefaults = (newState, {widthKey, heightKey, webpKey, qualityKey}, value) => {
        const img = Array.isArray(value) ? value[0] : value
        if (!img || !img.mimeType || !img.mimeType.startsWith('image/') || img.mimeType.includes('svg')) {
            return
        }
        const f = newState.fields
        if (f[widthKey] || f[heightKey] || f[webpKey]) {
            return
        }
        const set = (key, val) => {
            f[key] = val
            newState.fieldsDirty[key] = val
            if (this.props.onChange) {
                this.props.onChange({name: key, value: val, target: {name: key, value: val}})
            }
        }
        // without the original size nothing is preset (the size must never exceed the image)
        const info = img.info
        if (!info || !(info.width > 0) || !(info.height > 0)) {
            return
        }
        const w = Math.min(info.width, 1600)
        set(widthKey, String(w))
        set(heightKey, String(Math.round(w * info.height / info.width)))
        set(webpKey, true)
        if (qualityKey) {
            set(qualityKey, 90)
        }
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

        const imageDefaults = (fields[name.split('.')[0]] || {}).imageDefaults
        if (imageDefaults) {
            this.applyImageDefaults(newState, imageDefaults, value)
        }

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
        const fieldKeys = Object.keys(fields), formFields = [], tabs = [], formFieldsNoTabs = [], headerFields = []

        let expandableField, expandableData, datePolyfill = false
        const advancedToggles = {}
        for (let fieldIndex = 0; fieldIndex < fieldKeys.length; fieldIndex++) {
            const fieldKey = fieldKeys[fieldIndex],
                field = fields[fieldKey]


            if (!field || field.invisible) {
                continue
            }

            if (!isFieldVisibleForCurrentUser(field) ||
                (field.uistate && field.uistate.visible && matchExpr(field.uistate.visible, this.state.fields))){
                continue
            }

            if (field.advanced) {
                // less important options: collapsed behind a toggle (one per tab)
                const advancedKey = field.tab || ''
                const advancedOpen = !!(this.state.advancedOpen && this.state.advancedOpen[advancedKey])
                if (!advancedToggles[advancedKey]) {
                    advancedToggles[advancedKey] = true
                    const holder = field.tab ? this.getOrCreateTab(tabs, field).fields : formFields
                    holder.push(<div key={'advancedToggle' + advancedKey} style={{width: '100%', margin: '0.5rem 0'}}>
                        <Button size="small"
                                onClick={() => this.setState(state => ({
                                    advancedOpen: {...state.advancedOpen, [advancedKey]: !advancedOpen}
                                }))}>
                            {(advancedOpen ? '▾ ' : '▸ ') + _t('GenericForm.advancedOptions')}
                        </Button>
                    </div>)
                }
                if (!advancedOpen) {
                    continue
                }
            }

            let value = this.state.fieldsTmp[fieldKey] || this.state.fields[fieldKey]

            if(field.onlyShowIfData && value===null){
                continue
            }


            if (field.replaceBreaks && isString(value)) {
                value = value.replace(/<br>/g, '\n')
            }
            if (field.uitype === 'date' || field.uitype === 'datetime') {
                //iso date without ms
                value = convertFieldValueToDate(value, field)
                datePolyfill = true
            }

            let currentFormFields = formFields

            if (field.placement === 'header' && !expandableField) {
                currentFormFields = headerFields
            } else if (expandableField) {
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
            let uitype = field.uitype || (field.enum ? 'select' : 'text')

            if(field.dynamicSubFields){
                // set uitype to wrapper to hide original field
                if(!Util.hasCapability(_app_.user, CAPABILITY_MANAGE_TYPES)) {
                    uitype = 'wrapper'
                }

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
                         this.setState({showTranslations: Object.assign({}, this.state.showTranslations, {[fieldKey]: !this.state.showTranslations[fieldKey]})})
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
                            translateButton,
                            // translateButton is recreated on every render - its inputs decide instead
                            cacheExtra: [value, showTranslations, config.LANGUAGES.length]
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
                // move buttons in an own column inside the form (not absolutely positioned outside of it)
                holder.push(<div key={"expandableWrap" + fieldKey}
                                 style={{display: 'flex', alignItems: 'flex-start', gap: '0.25rem'}}>
                    <div style={{display: 'flex', flexDirection: 'column', flex: '0 0 auto', paddingTop: '0.3rem'}}>
                        <ExpandLessIconButton
                            size="small"
                            style={{padding: '1px'}}
                            title={_t('GenericForm.moveUp')}
                            disabled={field.index === 0}
                            onClick={() => {
                                if (this.props.onPosChange) {
                                    this.props.onPosChange({field, newIndex: field.index - 1})
                                }
                            }}/>
                        <ExpandMoreIconButton
                            size="small"
                            style={{padding: '1px'}}
                            title={_t('GenericForm.moveDown')}
                            onClick={() => {
                                if (this.props.onPosChange) {
                                    this.props.onPosChange({field, newIndex: field.index + 1})
                                }
                            }}/>
                    </div>
                    <div style={{flex: '1 1 auto', minWidth: 0}}>
                    <Expandable title={expandableField.expandable}
                                key={"expandable" + fieldKey}
                                onChange={(e) => {
                                    this.setState({expanded: fieldKey})
                                }}
                                expanded={this.state.expanded === fieldKey}>
                        {currentFormFields}
                    </Expandable></div></div>)

                expandableField = null
            }

        }

        if (datePolyfill) {
            this.loadFlatpickr()
        }
        this._hasHeaderFields = headerFields.length > 0
        const {tabValue} = this.state
        console.log('render GenericForm')
        const Wrapper = subForm ? 'div' : 'form'
        for (let i = tabs.length - 1; i >= 0; i--) {
            if (tabs[i].fields.length == 0) {
                tabs.splice(i, 1)
            }
        }

        return (
            <Wrapper style={this.props.style} id={this.props.id} ref={el => {
                this._rootRef = el
            }}>
                {this.renderHeaderFields(headerFields)}
                {tabs.length === 0 && formFields}
                {formFieldsNoTabs.length > 0 && formFieldsNoTabs}
                {tabs.length > 0 && <StyledTabContainer>
                    <SimpleTabs
                        style={{width:'100%'}}
                        variant="scrollable"
                        scrollButtons="auto"
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
                        <SimpleTabPanel key={'tabPanel-' + i} value={tabValue} index={i} contentSx={TAB_PANEL_SX}>
                            {tab.fields}
                        </SimpleTabPanel>
                    )}
                    {formFields.length > 0 &&
                    <SimpleTabPanel key={'tabPanel-' + tabs.length} value={tabValue} index={tabs.length} contentSx={TAB_PANEL_SX}>
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

        if(field.readOnly || field.uiReadOnly){
            Object.keys(subFields).forEach(key=>{
                subFields[key].readOnly = true
            })
        }

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
                    // replace $\{ in case it is escaped in template
                    title = Util.replacePlaceholders(field.titleTemplate.replaceAll('$\\{','${'), {_index: index, Util, ...values})
                } else {
                    Object.keys(values).map(k => {
                        if (title && values[k]) {
                            title += ' / '
                        }
                        title += values[k] || ''
                    })
                }

                const expandedKey = `expanded-${field.name}-${fieldKey}`
                const readOnly = field.readOnly || field.uiReadOnly
                const removeEntry = () => {
                    subFieldValues.splice(index, 1)
                    this.handleInputChange({
                        target: {
                            name: fieldKey,
                            value: subFieldValues
                        }
                    })
                }
                const cloneEntry = () => {
                    const clone = JSON.parse(JSON.stringify(subFieldValues[index]))
                    subFieldValues.push(clone)
                    this.handleInputChange({
                        target: {
                            name: fieldKey,
                            value: subFieldValues
                        }
                    })
                }
                // delete and duplicate directly in the heading, without expanding the entry.
                // delete needs a second click (within 3s), so a slip of the mouse does not remove an entry.
                // only one entry of the whole form asks at a time. kept outside of the state: handleInputChange builds
                // the new state from a copy of the old one and would bring the question back after the delete
                const confirmDelete = this._confirmDeleteEntry === valueFieldKey
                const setConfirmDelete = (key) => {
                    this._confirmDeleteEntry = key
                    // only to re-render (shouldComponentUpdate compares the state object)
                    this.setState({confirmDeleteTick: Date.now()})
                }
                const headerActions = readOnly || field.accordion === false ? null : <>
                    <Tooltip title={_t('GenericForm.clone')}>
                        <IconButton size="small" aria-label={_t('GenericForm.clone')} onClick={cloneEntry}>
                            <ContentCopyIcon fontSize="small"/>
                        </IconButton>
                    </Tooltip>
                    <Tooltip title={confirmDelete ? _t('GenericForm.deleteConfirm') : _t('GenericForm.delete')}>
                        {confirmDelete ?
                            <Button size="small" color="error" variant="contained" disableElevation
                                    sx={{ml: 0.5, py: 0, px: 1, height: '1.75rem', minWidth: 0, whiteSpace: 'nowrap', fontSize: '0.75rem', lineHeight: 1}}
                                    onClick={() => {
                                        clearTimeout(this._confirmDeleteTimeout)
                                        this._confirmDeleteEntry = null
                                        removeEntry()
                                    }}>{_t('GenericForm.deleteConfirm')}</Button> :
                            <IconButton size="small" aria-label={_t('GenericForm.delete')}
                                        onClick={() => {
                                            clearTimeout(this._confirmDeleteTimeout)
                                            setConfirmDelete(valueFieldKey)
                                            this._confirmDeleteTimeout = setTimeout(() => {
                                                if (!this._isUnmounted) setConfirmDelete(null)
                                            }, 3000)
                                        }}>
                                <DeleteIcon fontSize="small"/>
                            </IconButton>}
                    </Tooltip>
                </>
                // first image of the entry as small preview in the heading (entries with the same title can be told apart)
                let thumbnail = null
                for (const subKey of Object.keys(subFields)) {
                    if (subFields[subKey].type !== 'Media') continue
                    let media = values[subKey]
                    if (Array.isArray(media)) media = media[0]
                    if (media && (media._id || media.src) && (!media.mimeType || media.mimeType.indexOf('image') === 0)) {
                        thumbnail = getImageSrc(media, 'thumbnail')
                        break
                    }
                }
                currentFormFields.push(
                    <Expandable title={title}
                                thumbnail={thumbnail}
                                actions={headerActions}
                                draggable={!readOnly}
                                index={index}
                                // per form instance: nested forms can have lists with the same field name
                                dragGroup={(this._dragGroupId || (this._dragGroupId = 'gf' + Math.random().toString(36).slice(2))) + '-' + fieldKey}
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

                            if (subField.localized && subField.name) {
                                // mark as localized
                                if(!values[subField.name]) {
                                    values[subField.name] = {}
                                }else if(isString(values[subField.name])){
                                    values[subField.name] = {[config.DEFAULT_LANGUAGE]:values[subField.name]}
                                }
                                values[subField.name]._localized = true
                            }

                            setPropertyByPath(e.value, e.name, values)

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
                                color="secondary"
                                size="small"
                                disabled={readOnly}
                                startIcon={<DeleteIcon/>}
                                onClick={removeEntry}
                                variant="contained">{_t('GenericForm.delete')}</Button>
                        <Button key={'clone' + valueFieldKey}
                                color="primary"
                                startIcon={<ContentCopyIcon/>}
                                size="small"
                                disabled={readOnly}
                                onClick={cloneEntry}
                                variant="contained">{_t('GenericForm.clone')}</Button>

                    </Expandable>)
            })
            currentFormFields.push(<Button key={fieldKey}
                                           color={field.addButtonColor || 'primary'}
                                           variant="contained"
                                           size="small"
                                           disabled={field.readOnly || field.uiReadOnly}
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

            this.renderBulkAddButton(field, fieldKey, subFields, subFieldValues, currentFormFields)

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


    /*
     * Multi wrapper fields (multi + subFields) can set "bulkAdd" to add many entries at once:
     * the type picker of one sub field (uitype type_picker, e.g. Media) is opened with multi selection
     * and a new entry is created for every picked item.
     *   "bulkAdd": "image"
     *   "bulkAdd": {"field": "image", "label": "Mehrere Bilder auswählen", "defaults": {"size": "m"}}
     */
    renderBulkAddButton(field, fieldKey, subFields, subFieldValues, currentFormFields) {
        if (!field.bulkAdd) {
            return
        }
        const bulkAdd = isString(field.bulkAdd) ? {field: field.bulkAdd} : field.bulkAdd
        const pickerField = subFields[bulkAdd.field]
        if (!pickerField || !pickerField.type) {
            console.warn(`GenericForm: bulkAdd field ${bulkAdd.field} not found or has no type`)
            return
        }
        currentFormFields.push(<Button key={'bulkAdd' + fieldKey}
                                       color={field.addButtonColor || 'primary'}
                                       variant="outlined"
                                       size="small"
                                       startIcon={<AddIcon/>}
                                       disabled={field.readOnly || field.uiReadOnly}
                                       style={{marginLeft: '0.5rem', ...field.style}}
                                       onClick={() => {
                                           openTypePickerWindow({
                                               type: pickerField.type,
                                               multi: true,
                                               filter: pickerField.filter,
                                               genericType: pickerField.genericType,
                                               label: bulkAdd.label || pickerField.label,
                                               onSelect: (rawValue) => {
                                                   const rawItems = Array.isArray(rawValue) ? rawValue : [rawValue]
                                                   if (rawItems.length === 0) {
                                                       return
                                                   }
                                                   let fieldsToProject = pickerField.projection || pickerField.queryFields
                                                   if (!fieldsToProject && pickerField.pickerField) {
                                                       fieldsToProject = [].concat(pickerField.pickerField, '_id')
                                                   }
                                                   // read the current values again, the form may have changed in the meantime
                                                   const currentValues = propertyByPath(fieldKey, this.state.fields)
                                                   const newValues = Array.isArray(currentValues) ? currentValues.slice(0) : subFieldValues.slice(0)
                                                   rawItems.forEach(raw => {
                                                       const picked = convertRawValuesFromPicker({
                                                           type: pickerField.type,
                                                           fieldsToProject: fieldsToProject ? fieldsToProject.slice(0) : [],
                                                           rawValue: {...raw},
                                                           multi: false
                                                       })
                                                       newValues.push({
                                                           ...JSON.parse(JSON.stringify(bulkAdd.defaults || {})),
                                                           [pickerField.name]: picked
                                                       })
                                                   })
                                                   this.handleInputChange({
                                                       target: {
                                                           name: fieldKey,
                                                           value: newValues
                                                       }
                                                   })
                                               }
                                           })
                                       }}>{bulkAdd.label || _t('GenericForm.bulkAdd')}</Button>)
    }

    /*
     * Render cache per field: on every keystroke the whole form re-renders. Returning the identical
     * element objects for unchanged fields lets react skip them entirely (bailout on same element).
     * Fields whose output depends on other form values (placeholders, $enum, filters) also depend on
     * the state references, so they are rebuilt whenever anything changes - as before.
     */
    createInputField(params) {
        // hook must be called on every render in the same order
        const theme = useTheme()
        const {field, value, currentFormFields, fieldKey, languageCode, cacheExtra} = params
        const {state, props} = this

        if (!this._fieldCache) {
            this._fieldCache = {}
        }

        let dynamic = this._dynamicFields && this._dynamicFields.get(field)
        if (dynamic === undefined) {
            if (!this._dynamicFields) {
                this._dynamicFields = new WeakMap()
            }
            let json = ''
            try {
                json = JSON.stringify(field) || ''
            } catch (e) {
                json = '${'
            }
            dynamic = /\$\{|"replacePlaceholders"|"filter"|"highlight"|"helperText"|"autosuggestUrl"|"titleTemplate"|"\$enum"|"dependsOnForm"/.test(json)
            this._dynamicFields.set(field, dynamic)
        }

        const deps = [field, value, params.uitype, params.fieldIndex, languageCode, theme,
            state.fieldErrors[fieldKey],
            state.cmsEditorRevision && state.cmsEditorRevision[fieldKey],
            state.cmsElementsCollapsed && state.cmsElementsCollapsed[fieldKey],
            // width of the element palette (dragged by its right edge)
            state.cmsElementsWidth,
            props.autoFocus, props.onKeyDown, props.onButtonClick, props.values, props.id,
            ...(cacheExtra || []),
            ...(dynamic ? [state.fields, state.valuesOri, state.fieldsTmp] : [])]

        const cached = this._fieldCache[fieldKey]
        if (cached && cached.deps.length === deps.length && cached.deps.every((d, i) => d === deps[i])) {
            currentFormFields.push(...cached.elements)
            return cached.result
        }

        const elements = []
        const result = this.createInputFieldUncached({...params, currentFormFields: elements}, theme)
        this._fieldCache[fieldKey] = {deps, elements, result}
        currentFormFields.push(...elements)
        return result
    }

    createInputFieldUncached({uitype, field, value, currentFormFields, fieldKey, fieldIndex, languageCode, translateButton}, theme) {
        const {onKeyDown, autoFocus} = this.props
        let langButtonWasInserted = false
        if (!field.label) {
            field.label = ''
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
            if (field.replacePlaceholders) {
                html = Util.replacePlaceholders(field.html, {data: this.state.fields, valuesOri:this.state.valuesOri, Util})
            } else {
                html = field.html
            }

            currentFormFields.push(<span className={field.className} dangerouslySetInnerHTML={{__html: html}}/>)
        } else if (uitype === 'wrapper') {
            // do nothing for now
        } else if (['json', 'jsonEditor', 'editor', 'jseditor', 'css', 'htmlEditor','keyvalue'].indexOf(uitype) >= 0) {
            let highlight, jsonStr


            if (uitype === 'css') {
                highlight = 'css'
            } else if (uitype === 'htmlEditor') {
                highlight = 'html'
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


            if (field.highlight) {
                const newHighlight = Util.replacePlaceholders(field.highlight, this.state.fields)
                if (newHighlight) {
                    highlight = newHighlight
                }
            }

            currentFormFields.push(<FormControl key={'control' + fieldKey}
                                                className={field.className}
                                                error={!!this.state.fieldErrors[fieldKey]}
                                                sx={getSxProps({fullWidth: true}, theme)}>
                <InputLabel key={'label' + fieldKey}
                            onMouseEnter={(e) => {
                                if (field.label && field.name && field.label !== field.name) {
                                    showTooltip(field.name, e)
                                }
                            }}
                            onMouseLeave={() => {
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
                    })} componentTemplate={field.componentTemplate}
                                                      propertyTemplate={field.propertyTemplate}>{value}</JsonEditor> :

                    <CodeEditor
                        style={{border: '1px solid #eeeeee', margin: '16px 0'}}
                        height={field.height}
                        readOnly={field.readOnly || field.uiReadOnly}
                        identifier={(this.props.id || '') + '-' + fieldKey}
                        key={fieldKey}
                        controlled={field.controlled}
                        fileSplit={true}
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

                <FormHelperText error>{this.state.fieldErrors[fieldKey]}</FormHelperText>
            </FormControl>)

        } else if (uitype === 'CmsEditor') {
           // element palette is shown by default, set showElements: false to hide it
           const showCmsElements = field.showElements !== false && !field.readOnly && !field.uiReadOnly
           const cmsElementsCollapsed = this.state.cmsElementsCollapsed && this.state.cmsElementsCollapsed[fieldKey] !== undefined ?
               this.state.cmsElementsCollapsed[fieldKey] : !!field.elementsCollapsed
           // other entries of the same generic type as template (templateSource is set by the GenericData extension),
           // set showTemplates: false to hide it
           const showCmsTemplates = !!field.templateSource && field.showTemplates !== false && !field.readOnly && !field.uiReadOnly
           const cmsEditorRevision = (this.state.cmsEditorRevision && this.state.cmsEditorRevision[fieldKey]) || 0
           const cmsHasContent = typeof value === 'string' && !!value.trim() && value.trim() !== DEFAULT_TEMPLATE_MINIMAL.trim()
           const cmsTemplatePicker = showCmsTemplates && <CmsTemplatePicker
               dense
               source={field.templateSource}
               hasContent={cmsHasContent}
               onApply={(template) => {
                   this.handleInputChange({
                       target: {
                           dataset: {
                               language: languageCode
                           },
                           name: fieldKey,
                           value: template
                       }
                   })
                   // remount the editor, it keeps the template in its own state
                   this.setState({
                       cmsEditorRevision: {
                           ...this.state.cmsEditorRevision,
                           [fieldKey]: cmsEditorRevision + 1
                       }
                   })
               }}/>
           // import of documents / web pages / text as elements (set showImport: false to hide it)
           const cmsContentImport = field.showImport !== false && !field.readOnly && !field.uiReadOnly && <CmsContentImport
               hasContent={cmsHasContent}
               onApply={(elements, mode) => {
                   this.handleInputChange({
                       target: {
                           dataset: {
                               language: languageCode
                           },
                           name: fieldKey,
                           value: addElementsToTemplate(typeof value === 'string' ? value : '', elements, mode)
                       }
                   })
                   // remount the editor, it keeps the template in its own state
                   this.setState({
                       cmsEditorRevision: {
                           ...this.state.cmsEditorRevision,
                           [fieldKey]: cmsEditorRevision + 1
                       }
                   })
               }}/>
           currentFormFields.push(<FormControl key={'control' + fieldKey}
                                               className={field.className}
                                               error={!!this.state.fieldErrors[fieldKey]}
                                               sx={getSxProps({fullWidth: true}, theme)}>
               <InputLabel key={'label' + fieldKey}
                           onMouseEnter={(e) => {
                               if (field.label && field.name && field.label !== field.name) {
                                   showTooltip(field.name, e)
                               }
                           }}
                           onMouseLeave={() => {
                               hideTooltip()
                           }}
                           shrink>{field.label + (languageCode ? ' [' + languageCode + ']' : '')}</InputLabel>
               {!showCmsElements && (cmsTemplatePicker || cmsContentImport) && <div style={{marginTop: 16, maxWidth: 320}}>{cmsTemplatePicker}{cmsContentImport}</div>}
               <StyledCmsEditorFrame>
                   {showCmsElements && <StyledCmsElementsPanel collapsed={cmsElementsCollapsed}
                                                               panelWidth={this.state.cmsElementsWidth || loadCmsElementsWidth()}>
                       {!cmsElementsCollapsed && <Tooltip title={_t('CmsElement.resizeHint')} placement="right">
                           <StyledCmsElementsResizer
                               onDoubleClick={() => {
                                   this.setState({cmsElementsWidth: CMS_ELEMENTS_WIDTH_DEFAULT})
                                   try {
                                       window.localStorage.removeItem(CMS_ELEMENTS_WIDTH_KEY)
                                   } catch (e) {
                                   }
                               }}
                               onMouseDown={(e) => {
                                   e.preventDefault()
                                   const handle = e.currentTarget
                                   const startX = e.pageX, startWidth = this.state.cmsElementsWidth || loadCmsElementsWidth()
                                   handle.classList.add('dragging')
                                   // overlay: the editor below must not swallow the mouse events while dragging
                                   const overlay = document.createElement('div')
                                   overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;cursor:ew-resize'
                                   document.body.appendChild(overlay)
                                   let width = startWidth
                                   const move = ev => {
                                       width = Math.min(CMS_ELEMENTS_WIDTH_MAX, Math.max(CMS_ELEMENTS_WIDTH_MIN, startWidth + ev.pageX - startX))
                                       this.setState({cmsElementsWidth: width})
                                   }
                                   const up = () => {
                                       document.removeEventListener('mousemove', move)
                                       document.removeEventListener('mouseup', up)
                                       overlay.remove()
                                       handle.classList.remove('dragging')
                                       try {
                                           window.localStorage.setItem(CMS_ELEMENTS_WIDTH_KEY, String(width))
                                       } catch (e) {
                                       }
                                   }
                                   document.addEventListener('mousemove', move)
                                   document.addEventListener('mouseup', up)
                               }}/>
                       </Tooltip>}
                       <StyledCmsElementsScroll collapsed={cmsElementsCollapsed}>
                       <StyledCmsElementsHeader collapsed={cmsElementsCollapsed}>
                           {!cmsElementsCollapsed && <span>{_t('CmsElement.elements')}</span>}
                           <Tooltip title={_t(cmsElementsCollapsed ? 'CmsElement.showElements' : 'CmsElement.hideElements')}>
                               <IconButton size="small" onClick={() => {
                                   this.setState({
                                       cmsElementsCollapsed: {
                                           ...this.state.cmsElementsCollapsed,
                                           [fieldKey]: !cmsElementsCollapsed
                                       }
                                   })
                               }}>{cmsElementsCollapsed ? <AddIcon fontSize="small"/> :
                                   <ChevronLeftIcon fontSize="small"/>}</IconButton>
                           </Tooltip>
                       </StyledCmsElementsHeader>
                       {!cmsElementsCollapsed && cmsTemplatePicker}
                       {!cmsElementsCollapsed && cmsContentImport}
                       {!cmsElementsCollapsed && <CmsElement dense
                                                             hideAddCustom
                                                             advanced={field.advancedElements}/>}
                       </StyledCmsElementsScroll>
                   </StyledCmsElementsPanel>}
                   <StyledCmsEditorCanvas>
               <CmsEditorWithStyles fieldKey={fieldKey} field={field}>{editorStyles => <CmsViewContainer
                   key={'cmsEditor-' + fieldKey + '-' + cmsEditorRevision}
                   slug=""
                   forceEditMode={true}
                   cmsData={{
                       slug: '',
                       template: value ? value : DEFAULT_TEMPLATE_MINIMAL,
                       // @import of the page styles first, then the environment, the page styles and the editor styles
                       style: (editorStyles.imports ? editorStyles.imports + '\n\n' : '') +
                           DEFAULT_STYLE_ENVIRONMENT + '\n\n' +
                           (editorStyles.css ? editorStyles.css + '\n\n' : '') +
                           DEFAULT_STYLE_EDITOR
                   }}
                   onCmsDataChange={cmsPage => {
                       // the complete updated json, no graphql write happened
                       console.log(cmsPage)
                       this.handleInputChange({
                           target: {
                               dataset: {
                                   language: languageCode
                               },
                               name: fieldKey,
                               value: cmsPage.template
                           }
                       })
                   }}
               />}</CmsEditorWithStyles></StyledCmsEditorCanvas></StyledCmsEditorFrame></FormControl>
           )

        } else if (uitype === 'html') {
            const hasError = !!this.state.fieldErrors[fieldKey]


            currentFormFields.push(<FormControl style={{zIndex: 1}}
                                                key={'control' + fieldKey}
                                                className={field.className}
                                                sx={getSxProps({fullWidth:true},theme)}>
                <InputLabel key={'label' + fieldKey}
                            onMouseEnter={(e)=>{
                                if(field.label && field.name && field.label !== field.name) {
                                    showTooltip(field.name, e)
                                }
                            }}
                            onMouseLeave={()=>{
                                hideTooltip()
                            }}
                            // static instead of floating: the floating label sits far above the editor
                            sx={{position: 'relative', transform: 'none', fontSize: '0.75rem', lineHeight: 1.4, mb: 0.5}}
                            shrink>{field.label + (languageCode ? ' [' + languageCode + ']' : '')}</InputLabel>
                <TinyEditor key={fieldKey} id={fieldKey} error={hasError}

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
                                           color={field.color || 'primary'}
                                           variant="contained"
                                           style={field.style}
                                           onClick={() => {
                                               if (this.props.onButtonClick)
                                                   this.props.onButtonClick(field)
                                           }}>{field.label}</Button>)


        } else if (uitype === 'image') {

            currentFormFields.push(<FileDrop key={fieldKey} className={field.className} value={value}/>)

        } else if (uitype === 'imageCrop') {
            const src = this.getCropImageSrc(this.state.fields[field.srcKey])
            const w = parseFloat(this.state.fields[field.widthKey]), h = parseFloat(this.state.fields[field.heightKey])
            currentFormFields.push(<ImageCropper key={fieldKey}
                                                 src={src}
                                                 value={value}
                                                 aspect={w > 0 && h > 0 ? w / h : null}
                                                 label={field.label}
                                                 resetLabel={field.resetLabel}
                                                 onChange={(newValue) => this.handleInputChange({
                                                     target: {name: fieldKey, value: newValue}
                                                 })}/>)

        } else if (uitype === 'slider') {


            currentFormFields.push(<FormControl key={'control' + fieldKey} className={field.className} sx={getSxProps(field,theme)}>
                <Typography gutterBottom>{field.label + (languageCode ? ' [' + languageCode + ']' : '')}</Typography>
                <Slider name={fieldKey}
                onChange={this.handleInputChange}
                max={field.max || 100} min={field.min || 0}
                value={value === undefined || value === null || value === '' ?
                    (field.defaultValue !== undefined ? field.defaultValue : (field.min || 0)) : Number(value)}
                aria-label={field.label} valueLabelDisplay="auto" /></FormControl>)

        } else if (uitype === 'upload'){
            currentFormFields.push(<FileDrop onZipExtraction={(zipFiles)=>{
                this.handleInputChange({
                    target: {
                        dataset: {
                            language: languageCode
                        },
                        name: fieldKey,
                        value: zipFiles
                    }
                })
            }} accept={field.accept || '*/*'} key={fieldKey} className={field.className} value={value}/>)
        } else if (uitype === 'color_picker') {
            langButtonWasInserted = true
            currentFormFields.push(<ColorPicker key={fieldKey}
                                                name={fieldKey}
                                                className={field.className}
                                                sx={getSxProps(field, theme)}
                                                fullWidth={field.fullWidth}
                                                label={(field.label || field.name) + (languageCode ? ' [' + languageCode + ']' : '')}
                                                value={value || field.defaultValue || ''}
                                                placeholder={field.placeholder}
                                                presets={field.presets}
                                                alpha={field.alpha}
                                                readOnly={field.readOnly || field.uiReadOnly}
                                                error={!!this.state.fieldErrors[fieldKey]}
                                                helperText={this.state.fieldErrors[fieldKey] || field.helperText || ''}
                                                languageCode={languageCode}
                                                endAdornment={languageCode === _app_.lang ? translateButton : null}
                                                onBlur={this.handleBlur}
                                                onChange={this.handleInputChange}/>)

        } else if (uitype === 'type_picker') {
            langButtonWasInserted =true
            currentFormFields.push(<TypePicker
                className={field.className}
                keepTextValue={field.keepTextValue}
                showAlwaysAsImage={field.showAlwaysAsImage}
                value={(value ? (value.constructor === Array ? value : [value]) : null)}
                dataset={{
                    'language': languageCode
                }}
                slotProps={{
                    inputLabel:{
                        shrink: true,
                        onMouseEnter:e=>{
                            if(field.label && field.name && field.label !== field.name) {
                                showTooltip(field.name, e)
                            }
                        },
                        onMouseLeave:()=>{
                            hideTooltip()
                        }
                    },
                    input:{
                        endAdornment: languageCode === _app_.lang &&
                            <InputAdornment position="end">
                                {translateButton}
                            </InputAdornment>
                    }
                }}
                error={!!this.state.fieldErrors[fieldKey]}
                helperText={this.state.fieldErrors[fieldKey]}
                onChange={this.handleInputChange}
                sx={getSxProps(field,theme)}
                fullWidth={field.fullWidth}
                fileImport={field.fileImport}
                key={fieldKey}
                name={fieldKey}
                label={_t(field.label)+ (languageCode ? ' [' + languageCode + ']' : '')}
                readOnly={field.readOnly || field.uiReadOnly}
                genericType={field.genericType}
                filter={field.filter?Util.replacePlaceholders(field.filter, this.state):''}
                linkTemplate={field.linkTemplate}
                multi={field.multi}
                fieldTemplate={field.fieldTemplate}
                pickerField={field.pickerField} /* fields that are searched */
                searchFields={field.searchFields} /* fields that are shown in the picker */
                projection={field.projection} /* fields that are projected and returned */
                metaFields={field.metaFields} /* fields that need user input and are returned in addtion */
                queryFields={field.queryFields || field.fields}
                pickerSort={field.pickerSort}
                type={field.type}
                limit={field.limit}
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
                            readOnly={field.readOnly || field.uiReadOnly}
                            key={fieldKey} name={fieldKey}
                            onChange={this.handleInputChange}
                            items={items}
                            error={!!this.state.fieldErrors[fieldKey]}
                            hint={this.state.fieldErrors[fieldKey]}
                            multi={field.multi}
                            label={field.label || field.name}
                            sx={getSxProps(field,theme)}
                            slotProps={{inputLabel:{
                                shrink: true,
                                onMouseEnter: e => {
                                    if (field.label && field.name && field.label !== field.name) {
                                        showTooltip(field.name, e)
                                    }
                                },
                                onMouseLeave: () => {
                                    hideTooltip()
                                }
                            }}}
                            value={value}/>
                    }}
                </Query>)

            } else {

                if (field.$enum) {
                    field.enum = new Function('const state = this.state;return ' + field.$enum).call({
                        state: this.state
                    })
                }
                if (field.enum === '$TYPES') {
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
                    sx={getSxProps(field,theme)}
                    slotProps={{inputLabel:{
                        shrink: true,
                        onMouseEnter: e => {
                            if (field.label && field.name && field.label !== field.name) {
                                showTooltip(field.name, e)
                            }
                        },
                        onMouseLeave: () => {
                            hideTooltip()
                        }
                    }}}
                    value={value}/>)
            }
        } else if (field.uitype === 'autosuggest') {
                currentFormFields.push(<SimpleAutosuggest
                    multipleSeparator={field.multipleSeparator}
                    className={field.className}
                    name={fieldKey}
                    value={value}
                    sx={getSxProps(field,theme)}
                    readOnly={field.readOnly || field.uiReadOnly}
                    placeholder={field.placeholder}
                    label={(field.label || field.name) + (languageCode ? ' [' + languageCode + ']' : '')}
                    labelShrink={true}
                    freeSolo
                    search
                    /*historyKey={"GenericForm.autosuggest." + fieldKey}*/
                    apiUrl={(searchData)=>{
                        if(field.autosuggestUrl){
                            return Util.replacePlaceholders(field.autosuggestUrl, this)
                        }else {
                            return `/lunucapi/autosuggest?field=${field.name}&definition=${this.props.values?.definition?._id || ''}&s=%search%`
                        }
                    }}
                    filterOptions={(options)=>options}
                    nameRender={(item, key)=>{
                        let name = item.name || item.key
                        if(name && name[_app_.lang]){
                            name = name[_app_.lang]
                        }
                        return `${name}`
                    }}
                    onBlur={this.handleBlur}
                    onInputChange={async (e,value)=>{
                        if(!field.multipleSeparator) {
                            await this.handleInputChange({target: {name: fieldKey, value}})
                        }
                    }}
                    onChange={async (e, value)=>{
                        if(field.multipleSeparator){
                            await this.handleInputChange({target:{name:fieldKey,value}})
                        }
                    }}
                    onClick={()=>{}}/>)

        } else if (field.type === 'Boolean') {
            currentFormFields.push(<SimpleSwitch key={fieldKey}
                                                 readOnly={field.readOnly || field.uiReadOnly}
                                                 label={field.label || field.placeholder}
                                                 name={fieldKey}
                                                 className={field.className}
                                                 sx={getSxProps(field,theme)}
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
            // field.presets: [{name, short, value}] buttons in the field set a predefined value, a custom value
            // can still be typed in
            const presets = Array.isArray(field.presets) && field.presets.length > 0 && !(field.readOnly || field.uiReadOnly) ?
                <StyledPresets>{field.presets.map(preset => <StyledPreset
                    key={preset.value}
                    type="button"
                    tabIndex={-1}
                    data-active={String(value) === String(preset.value) ? 'true' : 'false'}
                    title={`${preset.name || preset.short}: ${preset.value}`}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => {
                        this.handleInputChange({target: {name: fieldKey, value: String(preset.value) === String(value) ? '' : preset.value}})
                    }}>{preset.short || preset.name}</StyledPreset>)}</StyledPresets> : null
            currentFormFields.push(<TextField autoFocus={autoFocus && fieldIndex === 0}
                                              error={!!this.state.fieldErrors[fieldKey]}
                                              key={fieldKey}
                                              id={fieldKey}
                                              className={field.className}
                                              label={(field.label || field.name) + (languageCode ? ' [' + languageCode + ']' : '')}
                                              sx={getSxProps(field,theme)}
                                              slotProps={{
                                                  inputLabel:{
                                                      shrink: true,
                                                      onMouseEnter:e=>{
                                                          if(field.label && field.name && field.label !== field.name) {
                                                              showTooltip(field.name, e)
                                                          }
                                                      },
                                                      onMouseLeave:()=>{
                                                          hideTooltip()
                                                      }
                                                  },
                                                  htmlInput:{
                                                      readOnly: field.readOnly || field.uiReadOnly,
                                                      step: field.step || '',
                                                      min: field.min || '',
                                                      max: field.max || '',
                                                      'data-language': languageCode,
                                                      'data-datetime-field': isDateOrTime
                                                  },
                                                  input:{
                                                      endAdornment: (presets || languageCode === _app_.lang) &&
                                                          <InputAdornment position="end">
                                                              {presets}
                                                              {languageCode === _app_.lang && translateButton}
                                                          </InputAdornment>
                                                  }
                                              }}
                                              helperText={this.state.fieldErrors[fieldKey]||(field.helperText?Util.replacePlaceholders(field.helperText, this.state.fields):'')}
                                              fullWidth={field.fullWidth}
                                              type={isDateOrTime?'text':uitype}
                                              multiline={uitype === 'textarea'}
                                              placeholder={field.placeholder}
                                              value={(value===0 && field.type==='Float'?0:value) || field.defaultValue || ''}
                                              name={fieldKey}
                                              onKeyDown={(e) => {
                                                  onKeyDown && onKeyDown(e, value)
                                              }}
                                              onPaste={(e)=>{
                                                if(field.type==='Float') {
                                                    // remove thousand separators
                                                    const value = e.clipboardData.getData('text/plain').replace(/[^0-9.-]/g, '')
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
                                                                           style={{right: '2.4rem',
                                                                               marginTop: '-0.5rem',
                                                                               position: 'absolute',
                                                                               zIndex: 2}}>{translateButton}</div>)
        }

        // description below the field as a muted hint (it used to be a full paragraph above the field,
        // which read like regular content and pushed the label away from its control)
        if (field.description) {
            const isSwitch = field.type === 'Boolean' && !field.uitype
            currentFormFields.push(<Typography key={'desc' + fieldKey}
                                               component="div"
                                               variant="caption"
                                               color="text.secondary"
                                               sx={{
                                                   display: 'block',
                                                   lineHeight: 1.45,
                                                   // a switch: align with its label text, right of the toggle
                                                   pl: isSwitch ? '3.6rem' : '0.875rem',
                                                   mt: isSwitch ? '-0.375rem' : '0.25rem',
                                                   mb: 1.5,
                                                   maxWidth: '48rem'
                                               }}>{field.description}</Typography>)
        }

    }

    getOrCreateTab(tabs, field) {
        const name = tabName(field.tab)
        const filteredTabs = tabs.filter(i => i.name === name)
        let tab
        if (filteredTabs.length === 0) {
            tab = {name, fields: []}

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

export default GenericForm