import React from 'react'
import PropTypes from 'prop-types'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TableFooter from '@mui/material/TableFooter'
import TablePagination from '@mui/material/TablePagination'
import TableSortLabel from '@mui/material/TableSortLabel'
import Tooltip from '@mui/material/Tooltip'
import Toolbar from '@mui/material/Toolbar'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import DeleteIcon from '@mui/icons-material/Delete'
import SimpleMenu from './SimpleMenu'
import theme from './theme'
import {_t} from 'util/i18n.mjs'
import styled from '@emotion/styled'
import Util from '../../../../util/index.mjs'
import {parseStyles} from '../../../../util/style'

const StyledScrollArea = styled.div`
    width: 100%;
    overflow-y: hidden;
    ::-webkit-scrollbar {
      height:8px;
    }
    ::-webkit-scrollbar-thumb {
      border-radius: 4px;
      background-color: rgba(0, 0, 0, .5);
      -webkit-box-shadow: 0 0 1px rgba(255, 255, 255, .5);
    }
`
const StyledSpacer = styled.div`
    flex: 1 1 100%;
`
const StyledTitle = styled.div`
    flex: 0 0 auto;
`
const StyledActions = styled.div`
    color: ${theme.palette.text.secondary};
    position:relative;
`

const StyledTableRow = styled(TableRow)(() => ({
    '&.MuiTableRow-hover:hover > .MuiTableCell-root':{
        backgroundColor:'rgb(244, 244, 244) !important'
    }
}))

//cellStyle:{position:'sticky', right:0, backgroundColor:'white'}


class SimpleTable extends React.Component {

    createSortHandler = property => {
        const {onSort} = this.props
        if (onSort)
            onSort(property)
    }

    render() {
        const {tableRenderer, tableRenderOption, style, title, actions, header, count, rowsPerPage, page, orderDirection, orderBy, onChangePage, onChangeRowsPerPage, onRowClick, columns, dataSource, footer} = this.props

        const numSelected = 0
        return <Paper elevation={1} style={style}>

            { (header || title || actions ?
                <Toolbar
                    sx={{
                        paddingRight: 1,
                        ...(numSelected > 0 && {
                            backgroundColor: theme.palette.secondary.light,
                            color: theme.palette.secondary.dark
                        })
                    }}
                >
                    <StyledTitle>
                        {numSelected > 0 ? (
                            <Typography variant="subtitle1">{numSelected} selected</Typography>
                        ) : (
                            <Typography variant="h6">{title}</Typography>
                        )}
                    </StyledTitle>
                    {header}
                    <StyledSpacer/>
                    {actions &&
                    <StyledActions>
                        {numSelected > 0 ? (
                            <Tooltip title="Delete">
                                <IconButton aria-label="Delete">
                                    <DeleteIcon />
                                </IconButton>
                            </Tooltip>
                        ) : (
                            <SimpleMenu items={actions}/>
                        )}
                    </StyledActions>
                    }
                </Toolbar> : null)
            }

            <StyledScrollArea>
                {tableRenderer ? tableRenderer() :
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            {columns && columns.map(column => {
                                return !column.hidden && <TableCell style={column.cellStyle} sx={{fontWeight:'bold'}} key={column.id}>

                                        {column.sortable ?
                                            <Tooltip
                                                title={'Sort ' + column.id}
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

                            let entryStyle
                            if(tableRenderOption && tableRenderOption.rowStyle){
                                const styleString = Util.replacePlaceholders(tableRenderOption.rowStyle, {Util, data:entry})
                                if(styleString) {
                                    entryStyle= parseStyles(styleString)
                                }
                            }

                            return (
                                <StyledTableRow
                                    style={entryStyle || entry.style}
                                    hover onClick={(e) => {
                                    if (onRowClick) {
                                        onRowClick(e, i)
                                    }
                                }} key={i}>
                                    { columns ?
                                        // use columns if available to have the same order
                                        columns.map(col => (
                                            <TableCell style={col.cellStyle?
                                                (entry.style && entry.style.background ?
                                                    Object.assign({},col.cellStyle,{background: entry.style.background}) :
                                                    col.cellStyle):null} key={col.id}>{entry[col.id]}</TableCell>
                                        ))
                                        :
                                        // in case there are no columns defined
                                        Object.keys(entry).map((key) => (
                                            <TableCell key={key}>{entry[key]}</TableCell>
                                        ))
                                    }
                                </StyledTableRow>
                            )
                        })}
                    </TableBody>
                    }

                </Table>}
            </StyledScrollArea>
            <Table>
                <TableFooter>
                    <TableRow>
                        <TableCell>{footer}</TableCell>
                        <TablePagination
                            labelRowsPerPage={_t('TablePagination.rowsPerPage')}
                            rowsPerPageOptions={[5, 10, 25, 50, 100, 1000, 2500, 5000]}
                            count={count}
                            rowsPerPage={rowsPerPage}
                            page={(page - 1)}
                            onPageChange={(e, page) => onChangePage(page + 1)}
                            onRowsPerPageChange={(e) => onChangeRowsPerPage(e.target.value)}
                        />
                    </TableRow>
                </TableFooter>
            </Table>
        </Paper>
    }
}

SimpleTable.propTypes = {
    footer: PropTypes.any,
    count: PropTypes.number,
    rowsPerPage: PropTypes.number,
    page: PropTypes.number,
    title: PropTypes.string,
    orderDirection: PropTypes.string,
    orderBy: PropTypes.string, // field name
    onChangePage: PropTypes.func,
    onChangeRowsPerPage: PropTypes.func,
    onRowClick: PropTypes.func,
    onSort: PropTypes.func,
    columns: PropTypes.array,
    dataSource: PropTypes.array,
    actions: PropTypes.array,
    header: PropTypes.any
}


export default SimpleTable
