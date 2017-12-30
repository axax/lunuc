import './style.less'

import React from 'react'

import {withStyles} from 'material-ui/styles'


const styles = theme => ({
    textField: {
        marginLeft: theme.spacing.unit,
        marginRight: theme.spacing.unit,
    }
})


// ui provider
import {MuiThemeProvider, createMuiTheme} from 'material-ui/styles';

const theme = createMuiTheme();

export const UIProvider = ({children, ...rest}) => {
    return <MuiThemeProvider theme={theme} {...rest}>{children}</MuiThemeProvider>
}


// Button
import MaterialButton from 'material-ui/Button'

export const Button = ({type, ...rest}) => {
    // map type to color
    return <MaterialButton color={type} {...rest} />
}

// Input
import MaterialTextField from 'material-ui/TextField'

export const Input = withStyles(styles, {withTheme: true})(({classes, ...rest}) => {
    return <MaterialTextField className={classes.textField} {...rest} />
})
export const Textarea = withStyles(styles, {withTheme: true})(({classes, ...rest}) => {
    return <MaterialTextField
        multiline className={classes.textField} {...rest} />
})


// layout components
export const Layout = ({children, ...rest}) => {
    return <div {...rest}>{children}</div>
}
export const LayoutHeader = Layout
export const LayoutContent = Layout
export const LayoutFooter = Layout


// menu components
export {default as HeaderMenu} from './HeaderMenu'


// pagination
export {default as Pagination} from '../plain/Pagination'


// grid
import MaterialGrid from 'material-ui/Grid'

export const Row = ({...rest}) => {
    return <MaterialGrid container {...rest} />
}
export const Col = ({...rest}) => {
    return <MaterialGrid item {...rest} />
}

// table
import MaterialTable, {TableBody, TableCell, TableHead, TableRow, TableFooter, TablePagination} from 'material-ui/Table'

export const Table = ({count, rowsPerPage, page, onChangePage, onChangeRowsPerPage, columns, dataSource, ...rest}) => {
    return <MaterialTable {...rest}>
        <TableHead>
            <TableRow>
                {(columns ? columns.map(column => {
                    return <TableCell key={column.dataIndex}>{column.title}</TableCell>
                }) : '')}
            </TableRow>
        </TableHead>
        <TableBody>
            {dataSource.map((entry, i) => {
                return (
                    <TableRow key={i}>
                        {Object.keys(entry).map((key) => (
                            <TableCell key={key}>{entry[key]}</TableCell>
                        ))}
                    </TableRow>
                )
            })}
        </TableBody>
        <TableFooter>
            <TableRow>
                <TablePagination
                    count={count}
                    rowsPerPage={rowsPerPage}
                    page={(page - 1)}
                    onChangePage={(e, page) => onChangePage(page + 1)}
                    onChangeRowsPerPage={(e) => onChangeRowsPerPage(e.target.value)}
                />
            </TableRow>
        </TableFooter>
    </MaterialTable>
}


// dialog
import MaterialDialog, {
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    withMobileDialog,
} from 'material-ui/Dialog'


export const Dialog = withMobileDialog()(({children,onClose,actions,title,...rest}) => {
    return <MaterialDialog
        aria-labelledby="responsive-dialog-title"
        onClose={onClose}
        {...rest}>
        <DialogTitle id="responsive-dialog-title">{title}</DialogTitle>
        <DialogContent>
            <DialogContentText>
                {children}
            </DialogContentText>
        </DialogContent>
        {actions ?
            <DialogActions>
                {actions.map((action, i) => {
                    return (
                        <Button key={i} onClick={() => {
                            onClose(action)
                        }} color={action.type}>
                            {action.label}
                        </Button>
                    )
                })}
            </DialogActions>
        :''}
    </MaterialDialog>
})

//drawer
import MaterialDrawer from 'material-ui/Drawer'

export const Drawer = ({children,...rest}) => {
    return <MaterialDrawer {...rest}>
        {children}
    </MaterialDrawer>
}


// drawer layout
export {default as DrawerLayout} from './DrawerLayout'


// divider
export Divider from 'material-ui/Divider'
