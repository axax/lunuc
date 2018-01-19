import './style.less'

import React from 'react'
import Pagination from './Pagination'

// ui provider
export const UIProvider = ({children, ...rest}) => {
    return <div {...rest}>{children}</div>
}


export const Button = ({raised, ...rest}) => {
    return <button {...rest} />
}

// IconButton
export const DeleteIconButton = ({...rest}) => {
    // map type to color
    return <button{...rest} >
        Delete
    </button>
}


// input
export const Input = ({...rest}) => {
    return <input {...rest} />
}
export const Textarea = ({...rest}) => {
    return <textarea {...rest} />
}

// Checkbox
export const Checkbox = ({...rest}) => {
    return <input type='checkbox' {...rest} />
}
//Switch
export const Switch = ({label, ...rest}) => {
    return <label><input type='checkbox' {...rest} /> {label}</label>
}


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
export {default as Pagination} from './Pagination'

// grid
export const Row = ({...rest}) => {
    return <div style={{display: 'flex'}} {...rest} />
}
export const Col = ({span, ...rest}) => {
    return <div style={{flex: '0 0 ' + (100 * span / 24) + '%'}} {...rest} />
}

// table
export const Table = ({count, rowsPerPage, page, onChangePage, onChangeRowsPerPage, columns, dataSource, ...rest}) => {

    const totalPages = Math.ceil((count ? count : 0) / (rowsPerPage ? rowsPerPage : 0))

    return <table className="Table" {...rest}>
        <thead>
        <tr>
            {(columns ? columns.map(column => {
                return <th key={column.dataIndex}>{column.title}</th>
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


// dialog
export const Dialog = ({children, onClose, actions, title, open, ...rest}) => {
    return <div style={{
        position: 'fixed',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        background: '#fff',
        display: (open ? 'block' : 'none')
    }}
                aria-labelledby="responsive-dialog-title"
                onClose={onClose}
                {...rest}>
        <h1 id="responsive-dialog-title">{title}</h1>
        <div>
            <div>
                {children}
            </div>
        </div>
        {actions ?
            <div>
                {actions.map((action, i) => {
                    return (
                        <Button key={i} onClick={() => {
                            onClose(action)
                        }} color="primary">
                            {action.label}
                        </Button>
                    )
                })}
            </div>
            : ''}
    </div>
}


// drawer layout
export {default as DrawerLayout} from './DrawerLayout'

// divider
export const Divider = ({...rest}) => {
    return <hr {...rest} />
}


// list
export const MenuList = ({children, ...rest}) => {
    return <ul {...rest}>
        {children}
    </ul>
}

export const MenuListItem = ({primary,button, ...rest}) => {
    return <li {...rest}>
        <span>{primary}</span>
    </li>
}


// snackbar
export const Snackbar = ({message, ...rest}) => {
    return <div style={{
        padding: '20px',
        position: 'fixed',
        top: 0,
        background: '#000',
        color: '#fff'
    }} {...rest}>{message}</div>
}

// cards
export const Card = ({children, ...rest}) => {
    return <div {...rest}>
        <div>
            {children}
        </div>
    </div>
}


// toolbar
export const Toolbar = ({title, children, ...rest}) => {
    return <div className="Toolbar">
        <div className="Toolbar__title">
            {title}
        </div>
    </div>
}



// linear progress
export const LinearProgress = () =>  {
    return <div className="LinearProgress">
        <div className="LinearProgress__indeterminate"></div>
    </div>
}