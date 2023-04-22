import React from 'react'
import {
    SettingsIcon,
    Typography
} from 'ui/admin'
import {getJsonDomElements, createElementByKeyFromList} from '../util/elements'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import {styled } from '@mui/material/styles';
import {getIconByKey} from '../../../client/components/ui/impl/material/icon'
import {JsonDomDraggable, onJsonDomDrag, onJsonDomDragEnd} from '../util/jsonDomDragUtil'


const StyledPaper = styled(Paper)(({ theme, disabled }) => ({
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

export default function CmsElement(props){

    const elements = getJsonDomElements(null, {advanced:props.advanced})

    const uiElements = []
    elements.forEach(element=>{
        const Icon = getIconByKey(element.icon, SettingsIcon)
        uiElements.push(
            <StyledPaper
                disabled={props.disabled}
                onDrag={onJsonDomDrag}
                onDragStart={(e) => {
                        e.stopPropagation()
                        if (!JsonDomDraggable.element) {
                            JsonDomDraggable.element = this
                            const newElement = createElementByKeyFromList(element.defaults.$inlineEditor.elementKey, elements)

                            JsonDomDraggable.props = {element: newElement}
                        }
                    }
                }
                onDragEnd={onJsonDomDragEnd}
                draggable={!props.disabled}>
                <Icon sx={{ fontSize: 30 }} />
                <Typography variant="subtitle1">{element.name}</Typography>
            </StyledPaper>)
    })

    return <Box
        sx={{
            display: 'flex',
            flexWrap: 'wrap',
            '& > :not(style)': {
                m: 1,
                width: 128,
                height: 128,
            },
        }}
    >{uiElements}</Box>
}
