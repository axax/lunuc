import React from 'react'
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


const SimpleTable = ({count, rowsPerPage, page, orderDirection, orderBy, onChangePage, onChangeRowsPerPage, onSort, columns, dataSource, ...rest}) => {
    const createSortHandler = property => event => {
        if (onSort)
            onSort(event, property)
    }


    return <Table {...rest}>
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
}

export default SimpleTable
