import React from 'react'
import PropTypes from 'prop-types'
import Table from '@material-ui/core/Table'
import TableBody from '@material-ui/core/TableBody'
import TableCell from '@material-ui/core/TableCell'
import TableHead from '@material-ui/core/TableHead'
import TableRow from '@material-ui/core/TableRow'
import TableFooter from '@material-ui/core/TableFooter'
import TablePagination from '@material-ui/core/TablePagination'
import TableSortLabel from '@material-ui/core/TableSortLabel'
import Tooltip from '@material-ui/core/Tooltip'
import Toolbar from '@material-ui/core/Toolbar'
import {withStyles} from '@material-ui/core/styles'
import Paper from '@material-ui/core/Paper'
import Typography from '@material-ui/core/Typography'
import IconButton from '@material-ui/core/IconButton'
import DeleteIcon from '@material-ui/icons/Delete'
import classNames from 'classnames'
import {lighten} from '@material-ui/core/styles/colorManipulator'
import SimpleMenu from './SimpleMenu'

const styles = theme => ({
    root: {
        width: '100%',
        overflowY: 'auto',
    },
    toolbar: {
        paddingRight: theme.spacing.unit,
    },
    highlight: theme.palette.type === 'light'
        ? {
            color: theme.palette.secondary.dark,
            backgroundColor: lighten(theme.palette.secondary.light, 0.4),
        }
        : {
            color: lighten(theme.palette.secondary.light, 0.4),
            backgroundColor: theme.palette.secondary.dark,
        },
    spacer: {
        flex: '1 1 100%',
    },
    actions: {
        color: theme.palette.text.secondary,
    },
    title: {
        flex: '0 0 auto',
    },
})


class SimpleTable extends React.Component {

    createSortHandler = property => {
        const {onSort} = this.props
        if (onSort)
            onSort(property)
    }

    render() {
        const {title, actions, classes, count, rowsPerPage, page, orderDirection, orderBy, onChangePage, onChangeRowsPerPage, columns, dataSource} = this.props
        const numSelected = 0
        return <Paper className={classes.root}>

            { (title || actions ?
                <Toolbar
                    className={classNames(classes.toolbar, {
                        [classes.highlight]: numSelected > 0,
                    })}
                >
                    <div className={classes.title}>
                        {numSelected > 0 ? (
                            <Typography variant="subheading">{numSelected} selected</Typography>
                        ) : (
                            <Typography variant="title">{title}</Typography>
                        )}
                    </div>
                    <div className={classes.spacer}/>
                    {actions &&
                    <div className={classes.actions}>
                        {numSelected > 0 ? (
                            <Tooltip title="Delete">
                                <IconButton aria-label="Delete">
                                    <DeleteIcon />
                                </IconButton>
                            </Tooltip>
                        ) : (
                            <Tooltip title="Actions">
                                <SimpleMenu items={actions}/>
                            </Tooltip>
                        )}
                    </div>
                    }
                </Toolbar> : null)
            }

            <Table>
                <TableHead>
                    <TableRow>
                        {columns && columns.map(column => {
                            return !column.hidden && <TableCell key={column.id}>

                                {column.sortable ?
                                    <Tooltip
                                        title="Sort"
                                        placement={column.numeric ? 'bottom-end' : 'bottom-start'}
                                        enterDelay={300}
                                    >
                                        <TableSortLabel
                                            active={orderBy === (column.sortid || column.id)}
                                            direction={orderDirection || 'asc'}
                                            onClick={this.createSortHandler.bind(this, column.sortid || column.id)}
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
                                { columns ?
                                        // use columns if available to have the same order
                                    columns.map(col => (
                                        <TableCell key={col.id}>{entry[col.id]}</TableCell>
                                    ))
                                    :
                                    // in case there are no columns defined
                                    Object.keys(entry).map((key) => (
                                        <TableCell key={key}>{entry[key]}</TableCell>
                                    ))
                                }
                            </TableRow>
                        )
                    })}
                </TableBody>
                }
                <TableFooter>
                    <TableRow>
                        <TablePagination
                            rowsPerPageOptions={[5, 10, 25, 50, 100, 1000]}
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
}

SimpleTable.propTypes = {
    classes: PropTypes.object.isRequired,
    theme: PropTypes.object,
    count: PropTypes.number,
    rowsPerPage: PropTypes.number,
    page: PropTypes.number,
    title: PropTypes.string,
    orderDirection: PropTypes.string,
    orderBy: PropTypes.string, // field name
    onChangePage: PropTypes.func,
    onChangeRowsPerPage: PropTypes.func,
    onSort: PropTypes.func,
    columns: PropTypes.array,
    dataSource: PropTypes.array,
    actions: PropTypes.array
}


export default withStyles(styles, {withTheme: true})(SimpleTable)
