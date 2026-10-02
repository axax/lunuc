import React from 'react'
import {
    SettingsIcon,
    SimpleDialog
} from 'ui/admin'
import {getJsonDomElements, createElementByKeyFromList} from '../util/elements'
import InputBase from '@mui/material/InputBase'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import {styled, alpha} from '@mui/material/styles'
import SearchIcon from '@mui/icons-material/Search'
import CloseIcon from '@mui/icons-material/Close'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import {getIconByKey} from '../../../client/components/ui/impl/material/icon'
import {JsonDomDraggable, onJsonDomDrag, onJsonDomDragEnd} from '../util/jsonDomDragUtil'
import {_t} from '../../../util/i18n.mjs'
import GenericForm from '../../../client/components/GenericForm'
import {useKeyValuesGlobal, setKeyValue} from '../../../client/util/keyvalue'

const STORAGE_COLLAPSED = 'CmsElement.collapsedGroups'
const STORAGE_RECENT = 'CmsElement.recent'
const MAX_RECENT = 6

// localStorage can be unavailable (private mode, blocked site data) - never let it break the palette
const readStorage = (key, fallback) => {
    try {
        const value = localStorage.getItem(key)
        return value ? JSON.parse(value) : fallback
    } catch (e) {
        return fallback
    }
}
const writeStorage = (key, value) => {
    try {
        localStorage.setItem(key, JSON.stringify(value))
    } catch (e) {
    }
}

// custom elements all share the elementKey 'customElement', so they are identified by name
const getElementId = (element, isCustom) => isCustom ? 'custom:' + element.name : element.defaults.$inlineEditor.elementKey


const StyledRoot = styled('div')(({theme}) => ({
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1)
}))

const StyledSearch = styled('div')(({theme, dense}) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: dense ? '2px 4px 2px 8px' : '4px 6px 4px 10px',
    borderRadius: '8px',
    border: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.paper,
    color: theme.palette.text.secondary,
    transition: 'border-color .15s, box-shadow .15s',
    '&:focus-within': {
        borderColor: theme.palette.primary.main,
        boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.15)}`
    },
    ...(dense && {
        position: 'sticky',
        top: 0,
        zIndex: 1
    })
}))

const StyledHint = styled('div')(({theme}) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '0.72rem',
    lineHeight: 1.3,
    color: theme.palette.text.secondary
}))

const StyledGroupHeader = styled('button')(({theme}) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    width: '100%',
    padding: '4px 2px',
    margin: 0,
    border: 0,
    background: 'none',
    cursor: 'pointer',
    color: theme.palette.text.secondary,
    font: 'inherit',
    fontSize: '0.7rem',
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    textAlign: 'left',
    borderRadius: '4px',
    '&:hover': {
        color: theme.palette.text.primary
    },
    '&:focus-visible': {
        outline: `2px solid ${theme.palette.primary.main}`
    },
    '& .chevron': {
        fontSize: '1.1rem',
        transition: 'transform .15s'
    },
    '&[aria-expanded="false"] .chevron': {
        transform: 'rotate(-90deg)'
    },
    '& .label': {
        flex: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
    },
    '& .count': {
        minWidth: '1.4rem',
        padding: '0 6px',
        borderRadius: '10px',
        textAlign: 'center',
        fontWeight: 500,
        backgroundColor: theme.palette.action.selected
    }
}))

const StyledGrid = styled('div')(({dense}) => ({
    display: 'grid',
    gridTemplateColumns: `repeat(auto-fill, minmax(${dense ? 84 : 112}px, 1fr))`,
    gap: dense ? '6px' : '10px',
    padding: '2px 0 6px 0'
}))

const StyledTile = styled('div', {
    shouldForwardProp: (prop) => prop !== 'dense' && prop !== 'disabled' && prop !== 'dragging' && prop !== 'variant'
})(({theme, dense, disabled, dragging, variant}) => ({
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: dense ? '4px' : '8px',
    minHeight: dense ? 72 : 96,
    padding: dense ? '8px 4px' : '12px 8px',
    borderRadius: '10px',
    border: `1px ${variant === 'add' ? 'dashed' : 'solid'} ${theme.palette.divider}`,
    backgroundColor: variant === 'add' ? 'transparent' : theme.palette.background.paper,
    color: theme.palette.text.secondary,
    userSelect: 'none',
    outline: 'none',
    transition: 'border-color .15s, box-shadow .15s, transform .15s, color .15s, opacity .15s',
    opacity: dragging ? 0.4 : 1,
    cursor: disabled ? 'not-allowed' : variant === 'add' ? 'pointer' : 'grab',
    ...(disabled && {
        opacity: 0.45
    }),
    '& .tile-icon': {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: dense ? 32 : 40,
        height: dense ? 32 : 40,
        borderRadius: '50%',
        backgroundColor: variant === 'add' ? 'transparent' : alpha(theme.palette.primary.main, 0.08),
        color: theme.palette.primary.main,
        transition: 'background-color .15s',
        '& svg': {
            fontSize: dense ? 20 : 24
        }
    },
    '& .tile-name': {
        fontSize: dense ? '0.72rem' : '0.8rem',
        lineHeight: 1.2,
        textAlign: 'center',
        wordBreak: 'break-word',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden'
    },
    '& .tile-edit': {
        position: 'absolute',
        top: 2,
        right: 2,
        opacity: 0,
        transition: 'opacity .15s'
    },
    ...(!disabled && {
        '&:hover, &:focus-visible': {
            borderColor: theme.palette.primary.main,
            color: theme.palette.text.primary,
            boxShadow: theme.shadows[2],
            transform: 'translateY(-1px)',
            '& .tile-icon': {
                backgroundColor: alpha(theme.palette.primary.main, 0.16)
            },
            '& .tile-edit': {
                opacity: 1
            }
        },
        '&:active': {
            cursor: variant === 'add' ? 'pointer' : 'grabbing',
            transform: 'none',
            boxShadow: 'none'
        }
    })
}))

const StyledEmpty = styled('div')(({theme}) => ({
    padding: theme.spacing(2, 1),
    textAlign: 'center',
    fontSize: '0.8rem',
    color: theme.palette.text.secondary
}))


// props:
// - disabled: elements can not be dragged
// - advanced: show advanced elements
// - dense: smaller tiles, e.g. when used inside a GenericForm
// - hideAddCustom: hide the button to create / edit custom elements
export default function CmsElement(props) {
    const {dense, disabled, hideAddCustom} = props

    // preact calls function components with the component instance as `this`;
    // the drag util needs it to find the dom node of the drag source
    const self = this

    const [showCustomElement, setShowCustomElement] = React.useState(null)
    const [search, setSearch] = React.useState('')
    const [collapsedGroups, setCollapsedGroups] = React.useState(() => readStorage(STORAGE_COLLAPSED, {}))
    const [recent, setRecent] = React.useState(() => readStorage(STORAGE_RECENT, []))
    const [draggingId, setDraggingId] = React.useState(null)
    const editDataForm = React.useRef(null)

    const keyValues = useKeyValuesGlobal(['CmsCustomElements'], {})

    if (keyValues.loading) {
        return null
    }

    const customElements = keyValues.data.CmsCustomElements || []
    const elements = getJsonDomElements(null, {advanced: props.advanced})
    const allElements = [...elements, ...customElements]

    const toggleGroup = (groupKey) => {
        const newCollapsed = {...collapsedGroups, [groupKey]: !collapsedGroups[groupKey]}
        setCollapsedGroups(newCollapsed)
        writeStorage(STORAGE_COLLAPSED, newCollapsed)
    }

    const rememberRecent = (id) => {
        const newRecent = [id, ...recent.filter(r => r !== id)].slice(0, MAX_RECENT)
        setRecent(newRecent)
        writeStorage(STORAGE_RECENT, newRecent)
    }

    // build groups: a new group starts at every element with a subHeader
    const groups = []
    let currentGroup = null
    elements.forEach(element => {
        if (element.subHeader || !currentGroup) {
            currentGroup = {
                key: element.subHeader || 'elements',
                label: element.subHeader || _t('CmsElement.elements'),
                items: []
            }
            groups.push(currentGroup)
        }
        currentGroup.items.push({element, isCustom: false})
    })

    const customGroup = {key: 'custom', label: _t('CmsElement.customTypes'), items: [], isCustom: true}
    customElements.forEach(element => {
        customGroup.items.push({element, isCustom: true})
    })
    if (customGroup.items.length > 0 || !hideAddCustom) {
        groups.push(customGroup)
    }

    // recently used elements on top
    const itemsById = {}
    groups.forEach(group => group.items.forEach(item => {
        itemsById[getElementId(item.element, item.isCustom)] = item
    }))
    const recentItems = recent.map(id => itemsById[id]).filter(Boolean)
    if (recentItems.length > 0) {
        groups.unshift({key: 'recent', label: _t('CmsElement.recent'), items: recentItems})
    }

    const searchTerm = search.trim().toLowerCase()
    const matches = (item) => !searchTerm || (item.element.name || '').toLowerCase().indexOf(searchTerm) >= 0


    const renderTile = ({element, isCustom}, groupKey) => {
        const id = getElementId(element, isCustom)
        const Icon = getIconByKey(element.icon, SettingsIcon)
        return <Tooltip key={groupKey + '-' + id}
                        title={disabled ? _t('CmsElement.disabledHint') : element.name}
                        placement="top"
                        enterDelay={600}
                        disableInteractive>
            <StyledTile
                dense={dense}
                disabled={disabled}
                dragging={draggingId === id}
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-label={element.name}
                aria-disabled={disabled}
                draggable={!disabled}
                onDrag={onJsonDomDrag}
                onDragStart={(e) => {
                    e.stopPropagation()
                    if (!JsonDomDraggable.element) {
                        JsonDomDraggable.element = self
                        const newElement = createElementByKeyFromList(element.defaults.$inlineEditor.elementKey, allElements)
                        if (element.defaults.$inlineEditor.options && !newElement.options) {
                            newElement.options = element.defaults.$inlineEditor.options
                        }
                        JsonDomDraggable.props = {element: newElement}
                    }
                    // defer the state change, some browsers cancel the drag when the source changes synchronously
                    setTimeout(() => setDraggingId(id), 0)
                }}
                onDragEnd={(e) => {
                    onJsonDomDragEnd(e)
                    setDraggingId(null)
                    rememberRecent(id)
                }}>
                <span className="tile-icon"><Icon/></span>
                <span className="tile-name">{element.name}</span>
                {isCustom && !hideAddCustom && !disabled &&
                    <IconButton className="tile-edit"
                                size="small"
                                aria-label={_t('CmsElement.editCustom')}
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setShowCustomElement(element)
                                }}><EditIcon sx={{fontSize: 14}}/></IconButton>}
            </StyledTile>
        </Tooltip>
    }

    const renderAddTile = () => <StyledTile key="addCustom"
                                            dense={dense}
                                            variant="add"
                                            role="button"
                                            tabIndex={0}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault()
                                                    openNewCustomElement()
                                                }
                                            }}
                                            onClick={openNewCustomElement}>
        <span className="tile-icon"><AddIcon/></span>
        <span className="tile-name">{_t('CmsElement.addCustom')}</span>
    </StyledTile>

    const openNewCustomElement = () => {
        setShowCustomElement({
            tagName: 'div',
            icon: 'member',
            name: 'Element Name',
            defaults: {
                c: [
                    {
                        $c: ''
                    },
                    {
                        t: 'Cms',
                        p: {
                            forceEditMode: '${editMode}',
                            slug: 'digithal/element/mitarbeitende',
                            props: {
                                showFilter: false,
                                $: {
                                    id: []
                                }
                            }
                        }
                    }
                ],
                $inlineEditor: {
                    elementKey: 'customElement',
                    allowDrag: true,
                    allowDrop: false,
                    options: {
                        c_0_$c: {
                            label: 'Text',
                            uitype: 'html',
                            tab: 'Allgemein',
                            tabPosition: 0
                        },
                        c_1_p_props_$_id: {
                            label: 'Mitarbeiter',
                            type: 'GenericData',
                            genericType: 'ThalMitarbeiter',
                            filter: 'definition.name==ThalMitarbeiter',
                            uitype: 'type_picker',
                            fullWidth: true,
                            pickerField: [
                                'vorname',
                                'name'
                            ],
                            fields: [
                                'vorname',
                                'name'
                            ],
                            multi: true,
                            tab: 'Mitarbeiter'
                        },
                    }
                },
                p: {
                    ['data-element-key']: 'customElement'
                }
            }
        })
    }

    const content = []
    let hasResults = false

    groups.forEach(group => {
        // recently used is redundant while searching
        if (searchTerm && group.key === 'recent') {
            return
        }
        const items = group.items.filter(matches)
        const showAdd = group.isCustom && !hideAddCustom && !searchTerm
        if (items.length === 0 && !showAdd) {
            return
        }
        hasResults = hasResults || items.length > 0
        const expanded = !!searchTerm || !collapsedGroups[group.key]

        content.push(<div key={'group-' + group.key}>
            <StyledGroupHeader type="button"
                               aria-expanded={expanded}
                               disabled={!!searchTerm}
                               onClick={() => toggleGroup(group.key)}>
                <ExpandMoreIcon className="chevron"/>
                <span className="label">{group.label}</span>
                <span className="count">{items.length}</span>
            </StyledGroupHeader>
            {expanded && <StyledGrid dense={dense}>
                {items.map(item => renderTile(item, group.key))}
                {showAdd && renderAddTile()}
            </StyledGrid>}
        </div>)
    })

    return <StyledRoot>
        <StyledSearch dense={dense}>
            <SearchIcon sx={{fontSize: 18}}/>
            <InputBase value={search}
                       placeholder={_t('CmsElement.search')}
                       inputProps={{'aria-label': _t('CmsElement.search')}}
                       sx={{flex: 1, fontSize: '0.85rem'}}
                       onKeyDown={(e) => {
                           if (e.key === 'Escape') {
                               setSearch('')
                           }
                       }}
                       onChange={(e) => setSearch(e.target.value)}/>
            {search && <IconButton size="small"
                                   aria-label={_t('CmsElement.clearSearch')}
                                   onClick={() => setSearch('')}><CloseIcon sx={{fontSize: 16}}/></IconButton>}
        </StyledSearch>

        <StyledHint>
            <DragIndicatorIcon sx={{fontSize: 16}}/>
            <span>{disabled ? _t('CmsElement.disabledHint') : _t('CmsElement.dragHint')}</span>
        </StyledHint>

        {content}

        {searchTerm && !hasResults && <StyledEmpty>{_t('CmsElement.noResults', {search: search.trim()})}</StyledEmpty>}

        {!hideAddCustom && <SimpleDialog fullWidth={true}
                                         maxWidth="md"
                                         key="customElementDialog"
                                         open={!!showCustomElement} onClose={(action) => {
            if (action.key === 'save' && editDataForm.current) {
                const newElement = editDataForm.current.state.fields.data
                const newElements = []

                let exists = false
                customElements.forEach(element => {
                    if (element.name == newElement.name) {
                        exists = true
                        element = newElement
                    }
                    newElements.push(element)
                })
                if (!exists) {
                    newElements.push(newElement)
                }

                setKeyValue({global: true, key: 'CmsCustomElements', value: newElements, clearCache: false}).then(() => {
                    if (self && self.forceUpdate) {
                        self.forceUpdate()
                    }
                })

            }
            setShowCustomElement(null)
        }}
                                         actions={[{
                                             key: 'no',
                                             label: _t('core.cancel'),
                                             type: 'primary'
                                         }, {key: 'save', label: _t('core.save')}]}
                                         title={_t('CmsElement.customTypes')}>
            {showCustomElement && <GenericForm onRef={(e) => {
                editDataForm.current = e
            }} primaryButton={false}
                                               values={{data: showCustomElement}}
                                               onChange={() => {
                                               }}
                                               fields={{
                                                   data: {
                                                       fullWidth: true,
                                                       label: 'Json',
                                                       uitype: 'json'
                                                   }
                                               }}/>}
        </SimpleDialog>}
    </StyledRoot>
}
