import React from 'react'
import PropTypes from 'prop-types'
import Table, {
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TableFooter,
    TablePagination,
    TableSortLabel
} from 'material-ui/Table'
import Tooltip from 'material-ui/Tooltip'
import {withStyles} from 'material-ui/styles'
import Paper from 'material-ui/Paper';

const styles = theme => ({
    root: {
        width: '100%',
        overflowY: 'auto',
    }
});


const SimpleTable = ({theme, classes, count, rowsPerPage, page, orderDirection, orderBy, onChangePage, onChangeRowsPerPage, onSort, columns, dataSource, ...rest}) => {
    const createSortHandler = property => event => {
        if (onSort)
            onSort(event, property)
    }


    return <Paper className={classes.root}>
        <Table {...rest}>
            <TableHead>
                <TableRow>
                    {columns && columns.map(column => {
                        return <TableCell key={column.dataIndex}>

                            {column.sortable ?
                                <Tooltip
                                    title="Sort"
                                    placement={column.numeric ? 'bottom-end' : 'bottom-start'}
                                    enterDelay={300}
                                >
                                    <TableSortLabel
                                        active={orderBy === column.dataIndex}
                                        direction={orderDirection}
                                        onClick={createSortHandler(column.dataIndex)}
                                    >
                                        {column.title}
                                    </TableSortLabel>
                                </Tooltip> : column.title }


                        </TableCell>
                    })}
                </TableRow>
            </TableHead>
            {dataSource &&
            <TableBody>
                {dataSource.map((entry, i) => {
                    return (
                        <TableRow hover key={i}>
                            {Object.keys(entry).map((key) => (
                                <TableCell key={key}>{entry[key]}</TableCell>
                            ))}
                        </TableRow>
                    )
                })}
            </TableBody>
            }
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
        </Table>
    </Paper>
}

SimpleTable.propTypes = {
    classes: PropTypes.object.isRequired
}

export default withStyles(styles, {withTheme: true})(SimpleTable)
