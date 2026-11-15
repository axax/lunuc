import React from 'react'
import Popper from '@mui/material/Popper'
import Paper from '@mui/material/Paper'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import HistoryIcon from '@mui/icons-material/History'
import CloseIcon from '@mui/icons-material/Close'

/*
 * Dropdown with recent search terms below a search field (like the quick search).
 * Purely presentational: filtering, keyboard handling and storage are done by the parent.
 */
const SearchHistoryPopper = ({anchorEl, open, items, highlighted, onSelect, onRemove}) => {
    if (!open || !anchorEl || !items || items.length === 0) {
        return null
    }
    return <Popper open anchorEl={anchorEl} placement="bottom-start"
                   style={{zIndex: 1300, width: anchorEl.clientWidth}}>
        <Paper elevation={4} sx={{mt: 0.5, py: 0.5, maxHeight: 360, overflowY: 'auto'}}>
            {items.map((item, index) =>
                <Box key={item}
                     onMouseDown={e => {
                         // keep the focus in the input
                         e.preventDefault()
                         onSelect(item)
                     }}
                     ref={index === highlighted ? el => el && el.scrollIntoView({block: 'nearest'}) : undefined}
                     sx={{
                         display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer',
                         p: '4px 4px 4px 12px', mx: 0.5, borderRadius: 1, minHeight: 36,
                         bgcolor: index === highlighted ? 'action.selected' : undefined,
                         '&:hover': {bgcolor: index === highlighted ? 'action.selected' : 'action.hover'}
                     }}>
                    <HistoryIcon fontSize="small" sx={{opacity: 0.7}}/>
                    <span style={{flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{item}</span>
                    {onRemove && <IconButton size="small" onMouseDown={e => {
                        e.preventDefault()
                        e.stopPropagation()
                        onRemove(item)
                    }}><CloseIcon fontSize="small"/></IconButton>}
                </Box>)}
        </Paper>
    </Popper>
}

export default SearchHistoryPopper
