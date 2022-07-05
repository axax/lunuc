import React from 'react'
import PropTypes from 'prop-types'
import List from '@mui/material/List'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import ListItemSecondaryAction from '@mui/material/ListItemSecondaryAction'
import Paper from '@mui/material/Paper'
import TablePagination from '@mui/material/TablePagination'
import Divider from '@mui/material/Divider'
import TextField from '@mui/material/TextField'


class SimpleList extends React.Component {
    render() {
        const {items, count, page, rowsPerPage, onChangePage, onChangeRowsPerPage, onFilterKeyDown, onFilterChange, filter} = this.props
        return <Paper>

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
            <List component="nav">
                {
                    (items && items.length ?
                        items.map((item, i) =>
                            <ListItem key={i} button={!!item.onClick} style={item.style} disabled={item.disabled} onClick={item.onClick}>
                                {item.icon &&
                                <ListItemIcon>
                                    {item.icon}
                                </ListItemIcon>
                                }
                                <ListItemText primary={item.primary} secondary={item.secondary}/>
                                <ListItemSecondaryAction>
                                    {item.actions}
                                </ListItemSecondaryAction>
                            </ListItem>
                        ) : <ListItem key="noresults" disabled={true}>
                            <ListItemText primary="No results"/>
                        </ListItem>)
                }
            </List>


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
}


SimpleList.propTypes = {
    items: PropTypes.array.isRequired,
    count: PropTypes.number,
    page: PropTypes.number,
    rowsPerPage: PropTypes.number,
    onChangePage: PropTypes.func,
    onFilterKeyDown: PropTypes.func,
    onFilterChange: PropTypes.func,
    onChangeRowsPerPage: PropTypes.func,
    filter: PropTypes.string
}

export default SimpleList
