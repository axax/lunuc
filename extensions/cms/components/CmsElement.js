import React from 'react'
import {
    SettingsIcon,
    Typography,
    Divider,
    AddIcon,
    SimpleDialog
} from 'ui/admin'
import {getJsonDomElements, createElementByKeyFromList} from '../util/elements'
import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import Paper from '@mui/material/Paper'
import Fab from '@mui/material/Fab'
import {styled} from '@mui/material/styles';
import {getIconByKey} from '../../../client/components/ui/impl/material/icon'
import {JsonDomDraggable, onJsonDomDrag, onJsonDomDragEnd} from '../util/jsonDomDragUtil'
import {_t} from '../../../util/i18n.mjs'
import GenericForm from '../../../client/components/GenericForm'
import {useKeyValuesGlobal, setKeyValue} from '../../../client/util/keyvalue'

const StyledPaper = styled(Paper)(({theme, disabled}) => ({
    textAlign: 'center',
    color: theme.palette.text.secondary,
    height: 60,
    padding: theme.spacing(2),
    ...(!disabled && {
        cursor: 'grab',
        '&:hover': {
            backgroundColor: 'rgba(244,244,244,1)',
        }
    }),
    ...(disabled && {
        color: 'rgba(0,0,0,0.3)'
    }),
}))

export default function CmsElement(props) {

    const [showCustomElement, setShowCustomElement] = React.useState(false)

    const keyValues = useKeyValuesGlobal(['CmsCustomElements'], {})

    if (keyValues.loading) {
        return null
    }

    const customElements = keyValues.data.CmsCustomElements

    const elements = getJsonDomElements(null, {advanced: props.advanced})

    const allUiElements = []
    let uiElements = []

    const pushUiElement = (element) => {

        const Icon = getIconByKey(element.icon, SettingsIcon)
        uiElements.push(
            <StyledPaper
                disabled={props.disabled}
                onDrag={onJsonDomDrag}
                onDragStart={(e) => {
                    e.stopPropagation()
                    if (!JsonDomDraggable.element) {
                        JsonDomDraggable.element = this
                        const allElements = customElements ? [...elements, ...customElements]: elements
                        const newElement = createElementByKeyFromList(element.defaults.$inlineEditor.elementKey, allElements)
                        if (element.defaults.$inlineEditor.options && !newElement.options) {
                            newElement.options = element.defaults.$inlineEditor.options
                        }
                        JsonDomDraggable.props = {element: newElement}
                    }
                }
                }
                onDragEnd={onJsonDomDragEnd}
                draggable={!props.disabled}>
                <Icon sx={{fontSize: 30}}/>
                <Typography variant="subtitle1">{_t(element.name)}</Typography>
            </StyledPaper>)
    }

    const pushUiElements = () => {
        if (uiElements.length > 0) {
            allUiElements.push(<Box
                sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    '& > :not(style)': {
                        m: 1,
                        width: 128,
                        height: 128,
                    },
                }}
            >{uiElements}</Box>)
            uiElements = []
        }
    }
    const pushDivider = (label) => {
        allUiElements.push(<Divider component="div" role="presentation"
                                    sx={{'alignItems': 'start', mt: 3, mb: 3}}>{label}</Divider>)
    }
    elements.forEach(element => {

        if (element.subHeader) {
            pushUiElements()
            pushDivider(element.subHeader)
        }
        pushUiElement(element)
    })

    pushUiElements()

    pushDivider(_t('CmsElement.customTypes'))

    if (customElements) {
        customElements.forEach(element => {

            if (element.subHeader) {
                pushUiElements()
                pushDivider(element.subHeader)
            }
            pushUiElement(element)
        })
    }

    pushUiElements()


    allUiElements.push(<Grid container justifyContent="flex-end">
        <Fab size="small" color="primary" aria-label="add" onClick={() => {
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
                            t:'Cms',
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
        }}>
            <AddIcon/>
        </Fab>
    </Grid>)
    allUiElements.push(<SimpleDialog fullWidth={true}
                                     maxWidth="md"
                                     key="customElementDialog"
                                     open={showCustomElement} onClose={(action) => {
        if (action.key === 'save') {
            const newElement = this.editDataForm.state.fields.data
            const elements = []

            let exits = false
            if (customElements) {

                customElements.forEach(element => {
                    if (element.name == newElement.name) {
                        exits = true
                        element = newElement
                    }
                    elements.push(element)
                })
            }
            if (!exits) {
                elements.push(newElement)
            }

            setKeyValue({global: true, key: 'CmsCustomElements', value: elements, clearCache: false}).then(() => {
                //location.href = location.href
                this.forceUpdate()
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
        <GenericForm onRef={(e) => {
            this.editDataForm = e
        }} primaryButton={false}
                     values={{data: showCustomElement}}
                     onChange={(e) => {
                     }}
                     fields={{
                         data: {
                             fullWidth: true,
                             label: 'Json',
                             uitype: 'json'
                         }
                     }}/>

    </SimpleDialog>)

    return allUiElements
}
