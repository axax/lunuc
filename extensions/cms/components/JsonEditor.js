import React from 'react'
import PropTypes from 'prop-types'
import {
    Box,
    Button,
    ButtonGroup,
    IconButton,
    TextField,
    Switch,
    FormControlLabel,
    InputAdornment,
    Tooltip,
    Menu,
    MenuItem,
    Collapse,
    Typography,
    Chip,
    AddIcon,
    DeleteIcon,
    ContentCopyIcon,
    ArrowUpwardIcon,
    ArrowDownwardIcon,
    ExpandMoreIcon,
    ExpandLessIcon,
    CodeIcon,
    OpenWithIcon,
    ViewListIcon
} from 'ui/admin'
import {_t} from '../../../util/i18n.mjs'

/*
 * Form-like editor for json values (arrays of entries, objects, nested arrays like submenus).
 * Styling only uses theme tokens (palette, spacing, shape), so it follows the active admin theme (incl. dark mode).
 *
 * props:
 *  children           json value (object/array or json string)
 *  onChange           called with the new value
 *  componentTemplate  template(s) for new entries: object or [{label, value}]
 *  propertyTemplate   predefined properties: [{label, key, value}] (e.g. {label: 'Untermenü', key: 'items', value: [...]})
 *  propertyLabels     optional labels for property keys: {to: 'Link'}
 */

// keys that are used as title / subtitle of an entry
const LABEL_KEYS = ['name', 'label', 'title', 'text', 't', 'key', 'id', 'slug']
const SUBTITLE_KEYS = ['to', 'href', 'url', 'link', 'src', 'value']
const TARGET_OPTIONS = ['_blank', '_self']
const CONFIRM_DELETE_MS = 3000

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v)
// {"de": "...", "en": "..."} or marked with _localized
const isLocalized = v => isObject(v) && (v._localized === true ||
    (Object.keys(v).length > 0 && Object.keys(v).every(k => /^[a-z]{2}$/.test(k) && typeof v[k] === 'string')))
const toText = v => isLocalized(v) ? _t(v) : (typeof v === 'string' || typeof v === 'number') ? String(v) : ''
const clone = v => v === undefined ? v : JSON.parse(JSON.stringify(v))

const parseValue = value => {
    if (value === undefined || value === null || value === '') {
        return {json: []}
    }
    if (typeof value === 'string') {
        try {
            return {json: JSON.parse(value)}
        } catch (e) {
            // keep the raw text, it is only shown in the json view until it is valid
            return {json: [], error: e.message, text: value}
        }
    }
    return {json: clone(value)}
}

const getIn = (node, path) => path.reduce((n, k) => (n === null || n === undefined) ? n : n[k], node)

// immutable update: only the objects along the path are copied
const setIn = (node, path, value, i = 0) => {
    if (i === path.length) return value
    const key = path[i]
    const copy = Array.isArray(node) ? node.slice() : {...node}
    copy[key] = setIn(node ? node[key] : undefined, path, value, i + 1)
    return copy
}

// empty copy of an entry (used for new entries in nested lists like submenus)
const blankFrom = item => {
    if (!isObject(item)) return typeof item === 'number' ? 0 : ''
    const res = {}
    Object.keys(item).forEach(k => {
        const v = item[k]
        if (Array.isArray(v) || (isObject(v) && !isLocalized(v))) return
        res[k] = (LABEL_KEYS.includes(k) || SUBTITLE_KEYS.includes(k) || isLocalized(v)) ? '' : v
    })
    return res
}

const pathToStr = path => path.join('.')

// open states are stored by path -> move them along when entries of an array change their position
const remapOpen = (open, arrPath, mapIndex) => {
    const prefix = arrPath.length ? pathToStr(arrPath) + '.' : ''
    const res = {}
    Object.keys(open).forEach(k => {
        if (!k.startsWith(prefix)) {
            res[k] = open[k]
            return
        }
        const rest = k.slice(prefix.length), dot = rest.indexOf('.'),
            idx = dot < 0 ? rest : rest.slice(0, dot)
        if (!/^\d+$/.test(idx)) {
            res[k] = open[k]
            return
        }
        const newIdx = mapIndex(parseInt(idx))
        if (newIdx >= 0) {
            res[prefix + newIdx + (dot < 0 ? '' : rest.slice(dot))] = open[k]
        }
    })
    return res
}

const stop = e => e.stopPropagation()

const SECTION_LABEL_SX = {
    flex: 1,
    fontWeight: 600,
    color: 'text.secondary',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
}

class JsonEditor extends React.Component {

    constructor(props) {
        super(props)
        const {json, error, text} = parseValue(props.children)
        this.state = {
            src: props.children,
            emitted: undefined,
            json,
            open: {},
            codeMode: !!error,
            codeText: error ? text : '',
            codeError: error || null,
            confirmDelete: null,
            dragOver: null,
            addKeyFor: null,
            newKey: '',
            menuAnchor: null,
            menuItems: null
        }
    }

    static getDerivedStateFromProps(props, state) {
        if (props.children !== state.src) {
            if (props.children === state.emitted) {
                // the value we just emitted comes back
                return {src: props.children}
            }
            // changed from outside
            const {json, error, text} = parseValue(props.children)
            return {
                src: props.children,
                emitted: undefined,
                json,
                codeText: error ? text : (state.codeMode ? JSON.stringify(json, null, 2) : ''),
                codeError: error || null
            }
        }
        return null
    }

    componentWillUnmount() {
        clearTimeout(this.confirmTimeout)
    }

    emit(json, patch) {
        this.setState({json, emitted: json, ...patch})
        if (this.props.onChange) {
            this.props.onChange(json)
        }
    }

    setValue(path, value) {
        this.emit(setIn(this.state.json, path, value))
    }

    /* array operations */

    addEntry(arrPath, value) {
        const arr = getIn(this.state.json, arrPath) || [],
            newIdx = arr.length
        this.emit(setIn(this.state.json, arrPath, [...arr, clone(value)]), {
            open: {...this.state.open, [pathToStr([...arrPath, newIdx])]: true}
        })
    }

    moveEntry(arrPath, from, to) {
        const arr = getIn(this.state.json, arrPath)
        if (!arr || from === to || to < 0 || to >= arr.length) return
        const order = arr.map((_, i) => i)
        order.splice(to, 0, order.splice(from, 1)[0])
        const newIndexOf = {}
        order.forEach((oldIdx, newIdx) => newIndexOf[oldIdx] = newIdx)
        this.emit(setIn(this.state.json, arrPath, order.map(i => arr[i])), {
            open: remapOpen(this.state.open, arrPath, i => newIndexOf[i])
        })
    }

    duplicateEntry(arrPath, index) {
        const arr = getIn(this.state.json, arrPath).slice()
        arr.splice(index + 1, 0, clone(arr[index]))
        this.emit(setIn(this.state.json, arrPath, arr), {
            open: remapOpen(this.state.open, arrPath, i => i > index ? i + 1 : i)
        })
    }

    removeEntry(arrPath, index) {
        const arr = getIn(this.state.json, arrPath).slice()
        arr.splice(index, 1)
        this.emit(setIn(this.state.json, arrPath, arr), {
            confirmDelete: null,
            open: remapOpen(this.state.open, arrPath, i => i < index ? i : i > index ? i - 1 : -1)
        })
    }

    /* object operations */

    addProperty(objPath, key, value) {
        const obj = getIn(this.state.json, objPath) || {}
        if (!key || obj[key] !== undefined) return
        this.emit(setIn(this.state.json, objPath, {...obj, [key]: clone(value)}), {addKeyFor: null, newKey: ''})
    }

    removeProperty(path) {
        const objPath = path.slice(0, -1), key = path[path.length - 1]
        const obj = {...getIn(this.state.json, objPath)}
        delete obj[key]
        this.emit(setIn(this.state.json, objPath, obj))
    }

    /* ui state */

    toggleOpen(pathStr) {
        this.setState({open: {...this.state.open, [pathStr]: !this.state.open[pathStr]}})
    }

    askDelete(pathStr) {
        clearTimeout(this.confirmTimeout)
        this.setState({confirmDelete: pathStr})
        this.confirmTimeout = setTimeout(() => this.setState({confirmDelete: null}), CONFIRM_DELETE_MS)
    }

    openMenu(e, menuItems) {
        e.stopPropagation()
        this.setState({menuAnchor: e.currentTarget, menuItems})
    }

    closeMenu() {
        this.setState({menuAnchor: null, menuItems: null})
    }

    setCodeMode(codeMode) {
        if (codeMode === this.state.codeMode) return
        if (codeMode) {
            this.setState({codeMode, codeText: JSON.stringify(this.state.json, null, 2), codeError: null})
        } else if (!this.state.codeError) {
            this.setState({codeMode})
        }
    }

    handleCodeChange(codeText) {
        try {
            const json = JSON.parse(codeText)
            this.emit(json, {codeText, codeError: null})
        } catch (e) {
            this.setState({codeText, codeError: e.message})
        }
    }

    labelFor(key) {
        const {propertyLabels} = this.props
        if (propertyLabels && propertyLabels[key]) {
            return _t(propertyLabels[key])
        }
        return _t('JsonEditor.prop.' + key, null, key)
    }

    getEntryTemplates(arr, path) {
        let templates = this.props.componentTemplate
        if (path.length === 0 && templates) {
            if (!Array.isArray(templates)) {
                // old structure: a single template object
                templates = [{label: _t('JsonEditor.addEntry'), value: templates}]
            }
            if (templates.length > 0) {
                return templates
            }
        }
        // nested lists (e.g. submenus): empty copy of the first entry
        let value = arr.length > 0 ? blankFrom(arr[0]) : undefined
        if (value === undefined) {
            const first = Array.isArray(templates) ? templates[0] && templates[0].value : templates
            value = first !== undefined ? blankFrom(first) : {}
        }
        return [{label: _t('JsonEditor.addEntry'), value}]
    }

    /* drag & drop within the same list */

    dragHandlers(path) {
        const arrStr = pathToStr(path.slice(0, -1)), index = path[path.length - 1], pathStr = pathToStr(path)
        return {
            onDragOver: e => {
                if (this.drag && this.drag.arrStr === arrStr) {
                    e.preventDefault()
                    e.stopPropagation()
                    e.dataTransfer.dropEffect = 'move'
                    if (this.state.dragOver !== pathStr) {
                        this.setState({dragOver: pathStr})
                    }
                }
            },
            onDrop: e => {
                if (this.drag && this.drag.arrStr === arrStr) {
                    e.preventDefault()
                    e.stopPropagation()
                    const from = this.drag.index
                    this.drag = null
                    this.setState({dragOver: null})
                    this.moveEntry(path.slice(0, -1), from, index)
                }
            }
        }
    }

    dragSourceProps(path) {
        return {
            draggable: true,
            onDragStart: e => {
                e.stopPropagation()
                this.drag = {arrStr: pathToStr(path.slice(0, -1)), index: path[path.length - 1]}
                e.dataTransfer.effectAllowed = 'move'
                // firefox needs data
                e.dataTransfer.setData('text/plain', '')
            },
            onDragEnd: () => {
                this.drag = null
                if (this.state.dragOver) {
                    this.setState({dragOver: null})
                }
            }
        }
    }

    /* rendering */

    renderEntryActions(path, index, length) {
        const arrPath = path.slice(0, -1), pathStr = pathToStr(path)
        const confirm = this.state.confirmDelete === pathStr
        return <Box sx={{display: 'flex', alignItems: 'center', flexShrink: 0}} onClick={stop}>
            <Tooltip title={_t('JsonEditor.moveUp')}>
                <span><IconButton size="small" disabled={index === 0}
                                  onClick={() => this.moveEntry(arrPath, index, index - 1)}>
                    <ArrowUpwardIcon fontSize="small"/>
                </IconButton></span>
            </Tooltip>
            <Tooltip title={_t('JsonEditor.moveDown')}>
                <span><IconButton size="small" disabled={index === length - 1}
                                  onClick={() => this.moveEntry(arrPath, index, index + 1)}>
                    <ArrowDownwardIcon fontSize="small"/>
                </IconButton></span>
            </Tooltip>
            <Tooltip title={_t('JsonEditor.duplicate')}>
                <IconButton size="small" onClick={() => this.duplicateEntry(arrPath, index)}>
                    <ContentCopyIcon fontSize="small"/>
                </IconButton>
            </Tooltip>
            {confirm ?
                <Button size="small" color="error" variant="contained" disableElevation
                        sx={{ml: 0.5, py: 0, minWidth: 0, whiteSpace: 'nowrap'}}
                        onClick={() => {
                            clearTimeout(this.confirmTimeout)
                            this.removeEntry(arrPath, index)
                        }}>{_t('JsonEditor.deleteConfirm')}</Button> :
                <Tooltip title={_t('JsonEditor.remove')}>
                    <IconButton size="small" onClick={() => this.askDelete(pathStr)}>
                        <DeleteIcon fontSize="small"/>
                    </IconButton>
                </Tooltip>}
        </Box>
    }

    renderDragHandle() {
        return <Box component="span"
                    sx={{display: 'flex', color: 'text.disabled', cursor: 'grab', '&:active': {cursor: 'grabbing'}}}>
            <OpenWithIcon fontSize="small"/>
        </Box>
    }

    renderEntry(item, path, length, depth) {
        const pathStr = pathToStr(path), index = path[path.length - 1],
            dragOver = this.state.dragOver === pathStr

        const cardSx = {
            border: 1,
            borderColor: dragOver ? 'primary.main' : 'divider',
            borderStyle: dragOver ? 'dashed' : 'solid',
            borderRadius: 1,
            bgcolor: 'background.paper',
            overflow: 'hidden',
            transition: 'border-color .15s'
        }

        if (!isObject(item) && !Array.isArray(item)) {
            // simple value in a list
            return <Box key={pathStr} sx={{...cardSx, display: 'flex', alignItems: 'center', gap: 1, p: 0.5, pl: 1}}
                        {...this.dragHandlers(path)}>
                <Box {...this.dragSourceProps(path)}>{this.renderDragHandle()}</Box>
                {this.renderPrimitiveInput(item, path, null)}
                {this.renderEntryActions(path, index, length)}
            </Box>
        }

        const isOpen = !!this.state.open[pathStr]
        let title = '', subtitle = '', childCount = 0
        if (Array.isArray(item)) {
            childCount = item.length
        } else {
            const titleKey = LABEL_KEYS.find(k => toText(item[k]))
            title = titleKey ? toText(item[titleKey]) : ''
            if (!title) {
                const firstKey = Object.keys(item).find(k => toText(item[k]) && !SUBTITLE_KEYS.includes(k))
                title = firstKey ? toText(item[firstKey]) : ''
            }
            const subKey = SUBTITLE_KEYS.find(k => toText(item[k]))
            subtitle = subKey ? toText(item[subKey]) : ''
            Object.keys(item).forEach(k => {
                if (Array.isArray(item[k])) childCount += item[k].length
            })
        }

        return <Box key={pathStr} sx={cardSx} {...this.dragHandlers(path)}>
            <Box {...this.dragSourceProps(path)}
                 onClick={() => this.toggleOpen(pathStr)}
                 sx={{
                     display: 'flex',
                     alignItems: 'center',
                     gap: 1,
                     px: 1,
                     py: 0.5,
                     minHeight: 44,
                     cursor: 'pointer',
                     userSelect: 'none',
                     bgcolor: isOpen ? 'action.selected' : 'transparent',
                     '&:hover': {bgcolor: 'action.hover'}
                 }}>
                {this.renderDragHandle()}
                {isOpen ? <ExpandLessIcon fontSize="small"/> : <ExpandMoreIcon fontSize="small"/>}
                <Box sx={{flex: 1, minWidth: 0}}>
                    <Typography variant="body2" noWrap
                                sx={{fontWeight: 600, color: title ? 'text.primary' : 'text.secondary'}}>
                        {title || _t('JsonEditor.newEntry')}
                    </Typography>
                    {subtitle && <Typography variant="caption" component="div" noWrap color="text.secondary">
                        {subtitle}
                    </Typography>}
                </Box>
                {childCount > 0 && <Chip size="small" variant="outlined"
                                         label={_t('JsonEditor.children', {count: childCount})}/>}
                {this.renderEntryActions(path, index, length)}
            </Box>
            <Collapse in={isOpen} unmountOnExit>
                <Box sx={{p: 1.5, borderTop: 1, borderColor: 'divider'}}>
                    {Array.isArray(item) ? this.renderArray(item, path, depth + 1) : this.renderObject(item, path, depth + 1)}
                </Box>
            </Collapse>
        </Box>
    }

    renderArray(arr, path, depth) {
        const templates = this.getEntryTemplates(arr, path)
        return <Box sx={{display: 'flex', flexDirection: 'column', gap: 1}}>
            {arr.length === 0 && <Typography variant="body2" color="text.secondary" sx={{fontStyle: 'italic'}}>
                {_t('JsonEditor.empty')}
            </Typography>}
            {arr.map((item, i) => this.renderEntry(item, [...path, i], arr.length, depth))}
            <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                <Button size="small" variant="outlined" startIcon={<AddIcon/>}
                        onClick={e => {
                            if (templates.length === 1) {
                                this.addEntry(path, templates[0].value)
                            } else {
                                this.openMenu(e, templates.map(t => ({
                                    label: t.label,
                                    onClick: () => this.addEntry(path, t.value)
                                })))
                            }
                        }}>
                    {templates.length === 1 ? templates[0].label : _t('JsonEditor.addEntry')}
                </Button>
                {path.length === 0 && this.renderModeToggle()}
            </Box>
        </Box>
    }

    renderRemovePropertyButton(path) {
        return <Tooltip title={_t('JsonEditor.removeProperty')}>
            <IconButton size="small" onClick={() => this.removeProperty(path)}>
                <DeleteIcon fontSize="small"/>
            </IconButton>
        </Tooltip>
    }

    renderPrimitiveInput(value, path, label) {
        const key = path[path.length - 1]
        const removeAdornment = label !== null ?
            <InputAdornment position="end">{this.renderRemovePropertyButton(path)}</InputAdornment> : undefined

        if (key === 'target' && (value === '' || value === undefined || value === null || TARGET_OPTIONS.includes(value))) {
            return <TextField select fullWidth size="small" label={label || undefined} value={value || ''}
                              onChange={e => this.setValue(path, e.target.value)}
                              slotProps={{input: {endAdornment: removeAdornment}}}>
                <MenuItem value="">{_t('JsonEditor.target.default')}</MenuItem>
                {TARGET_OPTIONS.map(o => <MenuItem key={o} value={o}>{_t('JsonEditor.target.' + o, null, o)}</MenuItem>)}
            </TextField>
        }

        const strValue = value === null || value === undefined ? '' : String(value)
        return <TextField fullWidth size="small" label={label || undefined} value={strValue}
                          multiline={strValue.length > 60 || strValue.indexOf('\n') >= 0} maxRows={8}
                          onChange={e => {
                              let v = e.target.value
                              if (typeof value === 'number' && v.trim() !== '' && !isNaN(Number(v))) {
                                  v = Number(v)
                              }
                              this.setValue(path, v)
                          }}
                          slotProps={{input: {endAdornment: removeAdornment}}}/>
    }

    renderProperty(value, key, path, depth) {
        const label = this.labelFor(key), pathStr = pathToStr(path)

        if (Array.isArray(value) || (isObject(value) && !isLocalized(value))) {
            return <Box key={pathStr}>
                <Box sx={{display: 'flex', alignItems: 'center', mb: 0.5}}>
                    <Typography variant="caption" sx={SECTION_LABEL_SX}>{label}</Typography>
                    {this.renderRemovePropertyButton(path)}
                </Box>
                <Box sx={{pl: 1.5, borderLeft: 2, borderColor: 'primary.main'}}>
                    {Array.isArray(value) ? this.renderArray(value, path, depth) : this.renderObject(value, path, depth)}
                </Box>
            </Box>
        }

        if (isLocalized(value)) {
            return <Box key={pathStr} sx={{display: 'flex', flexDirection: 'column', gap: 1}}>
                {Object.keys(value).filter(lang => lang !== '_localized').map(lang =>
                    <Box key={lang}>{this.renderPrimitiveInput(value[lang], [...path, lang], label + ' [' + lang + ']')}</Box>)}
            </Box>
        }

        if (typeof value === 'boolean') {
            return <Box key={pathStr} sx={{display: 'flex', alignItems: 'center'}}>
                <FormControlLabel sx={{flex: 1}} label={label}
                                  control={<Switch checked={value} onChange={e => this.setValue(path, e.target.checked)}/>}/>
                {this.renderRemovePropertyButton(path)}
            </Box>
        }

        return <Box key={pathStr}>{this.renderPrimitiveInput(value, path, label)}</Box>
    }

    renderAddProperty(obj, path) {
        const pathStr = pathToStr(path)
        if (this.state.addKeyFor === pathStr) {
            const {newKey} = this.state, exists = newKey && obj[newKey] !== undefined
            const add = () => newKey.trim() && !exists && this.addProperty(path, newKey.trim(), '')
            return <Box sx={{display: 'flex', alignItems: 'flex-start', gap: 1}}>
                <TextField size="small" autoFocus label={_t('JsonEditor.propertyName')} value={newKey}
                           error={!!exists} helperText={exists ? _t('JsonEditor.propertyExists') : undefined}
                           onChange={e => this.setState({newKey: e.target.value})}
                           onKeyDown={e => {
                               if (e.key === 'Enter') {
                                   e.preventDefault()
                                   add()
                               } else if (e.key === 'Escape') {
                                   this.setState({addKeyFor: null, newKey: ''})
                               }
                           }}/>
                <Button size="small" variant="contained" disableElevation disabled={!newKey.trim() || !!exists}
                        onClick={add}>{_t('JsonEditor.add')}</Button>
                <Button size="small" onClick={() => this.setState({addKeyFor: null, newKey: ''})}>
                    {_t('JsonEditor.cancel')}
                </Button>
                {path.length === 0 && this.renderModeToggle()}
            </Box>
        }

        const templates = (this.props.propertyTemplate || []).filter(t => t.key && obj[t.key] === undefined)
        const custom = () => this.setState({addKeyFor: pathStr, newKey: ''})

        return <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
            <Button size="small" startIcon={<AddIcon/>}
                    onClick={e => {
                        if (templates.length === 0) {
                            custom()
                        } else {
                            this.openMenu(e, [
                                ...templates.map(t => ({
                                    label: t.label || this.labelFor(t.key),
                                    onClick: () => this.addProperty(path, t.key, t.value)
                                })),
                                {label: _t('JsonEditor.customProperty'), onClick: custom, divider: true}
                            ])
                        }
                    }}>{_t('JsonEditor.addProperty')}</Button>
            {path.length === 0 && this.renderModeToggle()}
        </Box>
    }

    renderObject(obj, path, depth) {
        return <Box sx={{display: 'flex', flexDirection: 'column', gap: 1.5, pt: 0.5}}>
            {Object.keys(obj).map(k => this.renderProperty(obj[k], k, [...path, k], depth))}
            {this.renderAddProperty(obj, path)}
        </Box>
    }

    // switch form / json, right aligned in the footer row of the editor
    renderModeToggle() {
        const {codeMode, codeError} = this.state
        return <ButtonGroup size="small" disableElevation sx={{ml: 'auto', flexShrink: 0}}>
            <Button variant={codeMode ? 'outlined' : 'contained'} startIcon={<ViewListIcon/>}
                    disabled={codeMode && !!codeError}
                    onClick={() => this.setCodeMode(false)}>{_t('JsonEditor.form')}</Button>
            <Button variant={codeMode ? 'contained' : 'outlined'} startIcon={<CodeIcon/>}
                    onClick={() => this.setCodeMode(true)}>{_t('JsonEditor.code')}</Button>
        </ButtonGroup>
    }

    renderForm() {
        const {json} = this.state
        if (Array.isArray(json)) {
            return this.renderArray(json, [], 0)
        }
        if (isObject(json)) {
            return this.renderObject(json, [], 0)
        }
        return <TextField fullWidth size="small" value={json === null ? '' : String(json)}
                          onChange={e => this.emit(e.target.value)}/>
    }

    render() {
        const {codeMode, codeText, codeError, menuAnchor, menuItems, json} = this.state
        return <Box sx={{mt: 2.5, mb: 1, width: '100%'}}>
            {codeMode ?
                <TextField fullWidth multiline minRows={6} maxRows={30} value={codeText}
                           error={!!codeError}
                           helperText={codeError ? _t('JsonEditor.invalidJson', {message: codeError}) : undefined}
                           onChange={e => this.handleCodeChange(e.target.value)}
                           sx={{'& textarea': {fontFamily: 'monospace', fontSize: '0.8125rem'}}}/> :
                this.renderForm()}
            {(codeMode || (!Array.isArray(json) && !isObject(json))) &&
                <Box sx={{display: 'flex', mt: 1}}>{this.renderModeToggle()}</Box>}
            <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => this.closeMenu()}>
                {(menuItems || []).map((item, i) =>
                    <MenuItem key={i} divider={false} sx={item.divider ? {borderTop: 1, borderColor: 'divider'} : undefined}
                              onClick={() => {
                                  this.closeMenu()
                                  item.onClick()
                              }}>{item.label}</MenuItem>)}
            </Menu>
        </Box>
    }
}

JsonEditor.propTypes = {
    children: PropTypes.any,
    onChange: PropTypes.func,
    componentTemplate: PropTypes.oneOfType([PropTypes.object, PropTypes.array]),
    propertyTemplate: PropTypes.array,
    propertyLabels: PropTypes.object
}

export default JsonEditor
