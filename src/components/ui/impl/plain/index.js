import './style.less'

import React from 'react'
import Pagination from './Pagination'

// ui provider
export const UIProvider = ({ children, ...rest }) => {
    return <div {...rest}>{children}</div>
}


export const Button = ({ raised,  ...rest }) => {
    return <button {...rest} />
}

export const Input = ({ ...rest }) => {
    return <input {...rest} />
}


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
export {default as Pagination} from './Pagination'

// grid
export const Row = ({ ...rest }) => {
    return <div style={{display:'flex'}} {...rest} />
}
export const Col = ({ span, ...rest }) => {
    return <div style={{flex: '0 0 '+(100*span/24)+'%'}} {...rest} />
}

// table
export const Table = ({count,rowsPerPage,page,onChangePage,onChangeRowsPerPage,columns,dataSource, ...rest }) => {

    const totalPages = Math.ceil( (count?count:0) / (rowsPerPage?rowsPerPage:0))

    return <table {...rest}>
        <thead>
            <tr>
                {(columns ? columns.map(column => {
                    return  <th key={column.dataIndex}>{column.title}</th>
                }) : '')}
            </tr>
        </thead>
        <tbody>
            {dataSource.map((entry, i) => {
                return (
                    <tr key={i}>
                        {Object.keys(entry).map((key) => (
                            <td key={key}>{entry[key]}</td>
                        ))}
                    </tr>
                )
            })}
        </tbody>
        <tfoot>
        <tr>
            <td colSpan='0'>
                Page {page} of {totalPages}
                <Pagination onChangePage={onChangePage} currentPage={page} totalPages={totalPages}/>

            </td>
        </tr>
        </tfoot>
    </table>
}