import React from 'react'
import List from '@mui/material/List'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Checkbox from '@mui/material/Checkbox'
import Paper from '@mui/material/Paper'
import TablePagination from '@mui/material/TablePagination'
import Divider from '@mui/material/Divider'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import {_t} from 'util/i18n.mjs'
import SimpleMenu from './SimpleMenu.js'

export const SimpleList = ({sx, paperProps, onCheck, items, allChecked, count, page, contextMenu, rowsPerPage, onChangePage, onChangeRowsPerPage, onFilterKeyDown, onFilterChange, filter, ...rest}) => {
    const [checked, setChecked] = React.useState(allChecked?items.map((e,i)=>i):[])
    const [showContextMenu, setShowContextMenu] = React.useState(null)

    const handleToggle = (i) => {
        const currentIndex = checked.indexOf(i)
        const newChecked = [...checked]

        if (currentIndex === -1) {
            newChecked.push(i)
        } else {
            newChecked.splice(currentIndex, 1)
        }
        if(onCheck) {
            onCheck(newChecked)
        }
        setChecked(newChecked)
    }

    const handleContextMenu = (event, item) => {
        if(!contextMenu){
            return
        }
        event.preventDefault()
        setShowContextMenu(
            showContextMenu === null
                ? {
                    left: event.clientX + 2,
                    top: event.clientY - 6,
                    item
                }
                : // repeated contextmenu when it is already open closes it with Chrome 84 on Ubuntu
                  // Other native context menus might behave different.
                  // With this behavior we prevent contextmenu from the backdrop to re-locale existing context menus.
                null
        )
    }

    return <Paper {...paperProps}>
        {showContextMenu && <SimpleMenu open={showContextMenu}
                                        anchorReference={"anchorPosition"}
                                        anchorPosition={showContextMenu}
                                        payload={showContextMenu.item}
                                        onClose={() => {
                                            setShowContextMenu(null)
                                        }}
                                        key="menu" noButton items={contextMenu}/>}
        {onFilterChange &&
        <div style={{padding: '10px 20px'}}>
            <TextField label="Search"
                       autoFocus
                       fullWidth={true}
                       type="text"
                       defaultValue={filter}
                       onKeyDown={onFilterKeyDown}
                       onChange={onFilterChange}/>
        </div>
        }
        <List component="nav" sx={sx}>
            {
                (items && items.length ?
                    items.map((item, i) =>
                        <ListItem key={i}
                                  button={(!!item.onClick || item.checkbox)}
                                  style={item.style}
                                  disabled={item.disabled}
                                  onContextMenu={(e)=>{handleContextMenu(e,item)}}
                                  onClick={(e)=>{

                                        if(item.checkbox) {
                                            handleToggle(i)
                                        }

                                        if(item.onClick) {
                                            item.onClick(e)
                                        }
                                    }}
                                  secondaryAction={item.actions}>
                            {(item.icon || item.checkbox) &&
                            <ListItemIcon>
                                {item.checkbox && <Checkbox
                                    edge="start"
                                    checked={checked.indexOf(i) !== -1}
                                    tabIndex={-1}
                                    disableRipple
                                />}
                                {item.icon}
                            </ListItemIcon>
                            }
                            <ListItemText primary={item.primary} secondary={item.secondary}/>
                        </ListItem>
                    ) : <ListItem key="noresults" disabled={true}>
                        <ListItemText primary="No results"/>
                    </ListItem>)
            }
        </List>

        {onCheck &&
        <Button onClick={()=>{
            setChecked([])
        }}>{_t('core.deselectAll')}</Button>}

        {count && rowsPerPage && onChangePage ?
            <div>
                <Divider />
                <TablePagination
                    component="div"
                    rowsPerPageOptions={[5, 10, 25, 50, 100, 1000]}
                    count={count}
                    rowsPerPage={rowsPerPage}
                    page={page - 1}
                    onPageChange={(e, page) => onChangePage(page + 1)}
                    onRowsPerPageChange={(e) => onChangeRowsPerPage(e.target.value)}
                />
            </div> : null
        }
    </Paper>
}

export default SimpleList
