/*
    There are different options for styling
    1. Add styles to the style.less file
    2. Change properties in the theme (see const theme below)
    3. use withStyles (see const styles below)
 */

import './style.less'

import React from 'react'

// ui provider
import {MuiThemeProvider, createMuiTheme} from 'material-ui/styles'
import indigo from 'material-ui/colors/indigo'
import pink from 'material-ui/colors/pink'
import red from 'material-ui/colors/red'
const defaultTheme = createMuiTheme()

// override the default theme
const theme =  createMuiTheme({
    palette: {
        contrastThreshold: 3.1,
        tonalOffset: 0.07,
        primary: {
            light: indigo[300],
            main: indigo[500],
            dark: indigo[700],
            contrastText: defaultTheme.palette.getContrastText(indigo[500]),
        },
        secondary: {
            light: pink.A200,
            main: pink.A400,
            dark: pink.A700,
            contrastText: defaultTheme.palette.getContrastText(pink.A400),
        },
        error: red.A400,
    },
})

export const UIProvider = ({children, ...rest}) => {
    return <MuiThemeProvider theme={theme} {...rest}>{children}</MuiThemeProvider>
}

// define some styles so it can be used in the components
import {withStyles} from 'material-ui/styles'

const styles = theme => ({
    textField: {
        marginLeft: theme.spacing.unit,
        marginRight: theme.spacing.unit,
    }
})



// Button
import MaterialButton from 'material-ui/Button'

export const Button = ({type, ...rest}) => {
    // map type to color
    return <MaterialButton color={type} {...rest} />
}

// IconButton
import MaterialIconButton from 'material-ui/IconButton'
import MaterialDeleteIcon from 'material-ui-icons/Delete'

export const DeleteIconButton = ({...rest}) => {
    // map type to color
    return <MaterialIconButton{...rest} >
        <MaterialDeleteIcon />
    </MaterialIconButton>
}

// Input
import MaterialTextField from 'material-ui/TextField'

export const Input = withStyles(styles, {withTheme: true})(({classes, ...rest}) => {
    return <MaterialTextField className={classes.textField} {...rest} />
})

// Checkbox
import MaterialCheckbox from 'material-ui/Checkbox'
export const Checkbox = ({...rest}) => {
    return <MaterialCheckbox {...rest} />
}
//Switch
import { FormControlLabel } from 'material-ui/Form'
import MaterialSwitch from 'material-ui/Switch'
export const Switch = ({label,...rest}) => {
    return <FormControlLabel
        control={
            <MaterialSwitch
                {...rest}
            />
        }
        label={label}
    />
}



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


export const Dialog = withMobileDialog()(({children, onClose, actions, title, ...rest}) => {
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
            : ''}
    </MaterialDialog>
})

//drawer
import MaterialDrawer from 'material-ui/Drawer'

export const Drawer = ({children, ...rest}) => {
    return <MaterialDrawer {...rest}>
        {children}
    </MaterialDrawer>
}


// drawer layout
export {default as DrawerLayout} from './DrawerLayout'


// divider
export Divider from 'material-ui/Divider'


// list
import MaterialList, {
    ListItem as MaterialListItem,
    ListItemIcon as MaterialListItemIcon,
    ListItemText as MaterialListItemText
} from 'material-ui/List'

export const MenuList = ({children, ...rest}) => {
    return <MaterialList {...rest}>
        {children}
    </MaterialList>
}

export const MenuListItem = ({primary, ...rest}) => {
    return <MaterialListItem {...rest}>
        <MaterialListItemText
            primary={primary}
            secondary={null}
        />
    </MaterialListItem>
}


// snackbar
import MaterialSnackbar from 'material-ui/Snackbar'
export const Snackbar = ({children, ...rest}) => {
    return <MaterialSnackbar message={children} {...rest} />
}


// cards
import MaterialCard, { CardActions as MaterialCardActions, CardContent as MaterialCardContent } from 'material-ui/Card'
export const Card = ({children, ...rest}) => {
    return <MaterialCard {...rest}>
        <MaterialCardContent>
            {children}
        </MaterialCardContent>
    </MaterialCard>
}