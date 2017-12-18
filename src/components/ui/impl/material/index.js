import './style.less'

import React from 'react'

import { withStyles } from 'material-ui/styles'


const styles = theme => ({
    textField: {
        marginLeft: theme.spacing.unit,
        marginRight: theme.spacing.unit,
    }
})


// ui provider
import { MuiThemeProvider, createMuiTheme } from 'material-ui/styles';

const theme = createMuiTheme();

export const UIProvider = ({ children, ...rest }) => {
    return <MuiThemeProvider theme={theme} {...rest}>{children}</MuiThemeProvider>
}


// Button
import MaterialButton from 'material-ui/Button'

export const Button = ({ type, ...rest }) => {
    // map type to color
    return <MaterialButton color={type} {...rest} />
}

// Input
import MaterialTextField from 'material-ui/TextField'

export const Input = withStyles(styles,{ withTheme: true })(({ classes, ...rest }) => {
    return <MaterialTextField className={classes.textField} {...rest} />
})


// layout components
export const Layout = ({ children, ...rest }) => {
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

export const Row = ({ ...rest }) => {
    return <MaterialGrid container {...rest} />
}
export const Col = ({ ...rest }) => {
    return <MaterialGrid item {...rest} />
}

// table
import MaterialTable, { TableBody, TableCell, TableHead, TableRow, TableFooter, TablePagination } from 'material-ui/Table'

export const Table = ({count,rowsPerPage,page,onChangePage,onChangeRowsPerPage,columns,dataSource, ...rest }) => {
    return <MaterialTable {...rest}>
        <TableHead>
            <TableRow>
                {(columns ? columns.map(column => {
                    return  <TableCell key={column.dataIndex}>{column.title}</TableCell>
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
                    page={(page-1)}
                    onChangePage={(e,page)=>onChangePage(page+1)}
                    onChangeRowsPerPage={onChangeRowsPerPage}
                />
            </TableRow>
        </TableFooter>
    </MaterialTable>
}