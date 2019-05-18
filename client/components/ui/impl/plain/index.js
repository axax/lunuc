import './style/index.global.less'

import React from 'react'
import Pagination from './Pagination'

/* JSS increases bundle size drastically */
/*import injectSheet, {ThemeProvider} from 'react-jss'
 export const withStyles = injectSheet

 const styles = theme => ({
 button: {
 background: theme.colorPrimary
 },
 label: {
 fontWeight: 'bold'
 }
 })

 const theme = {
 colorPrimary: 'green'
 }


 // ui provider
 export const UIProvider = ({children}) => {
 return <ThemeProvider theme={theme}>{children}</ThemeProvider>
 }
 */
const styles = {}
const injectSheet = (e) => {
    return (f) => {
        return function (p) {
            return f({classes: {}, ...p})
        }
    }
}
export const UIProvider = ({children}) => {
    return <div className="UIProvider">{children}</div>
}
export const withStyles = injectSheet

export const Button = injectSheet(styles)(({classes, ...rest}) => {
    return <button className={classes.button} {...rest} />
})


// input
export const Input = ({...rest}) => {
    return <input {...rest} />
}

export const TextField = ({multiline, ...rest}) => {
    if (multiline) {
        return <textarea {...rest} />
    }
    return <input {...rest} />
}

// Checkbox
export const Checkbox = ({...rest}) => {
    return <input type='checkbox' {...rest} />
}
// Select
export const Select = ({...rest}) => {
    return <input type='checkbox' {...rest} />
}

//Switch
export const SimpleSwitch = ({label, ...rest}) => {
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
export const Row = ({className, ...rest}) => {
    return <div className={'row' + (className ? ' ' + className : '')} {...rest} />
}
export const Col = ({xs, sm, md, lg, xl, mdAlign, className, ...rest}) => {
    return <div
        className={'col' + (xs ? ' col-xs-' + xs : '') + (sm ? ' col-sm-' + sm : '') + (md ? ' col-md-' + md : '') + (lg ? ' col-lg-' + lg : '') + (xl ? ' col-xl-' + xl : '') + (mdAlign ? ' col-md-align-' + mdAlign : '') + (className ? ' ' + className : '')} {...rest} />
}

// table
export const SimpleTable = ({count, rowsPerPage, page, onChangePage, orderDirection, orderBy, onChangeRowsPerPage, onSort, columns, dataSource, ...rest}) => {

    const totalPages = Math.ceil((count ? count : 0) / (rowsPerPage ? rowsPerPage : 0))

    return <table className="Table" {...rest}>
        <thead>
        <tr>
            {(columns ? columns.map(column => {
                return <th key={column.id}>{column.title}</th>
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
export const SimpleDialog = ({children, onClose, actions, title, open, ...rest}) => {
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
export {default as DrawerLayout} from './layouts/DrawerLayout'
export {default as ResponsiveDrawerLayout} from './layouts/DrawerLayout'


// simple menu
export {default as SimpleMenu} from './SimpleMenu'

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

export const MenuListItem = ({primary, children, button, ...rest}) => {
    return <li {...rest}>
        <span>{children || primary}</span>
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
    return <div className="Card" {...rest}>
        <div className="Card__content">
            {children}
        </div>
    </div>
}


// toolbar
export const SimpleToolbar = ({title, children, ...rest}) => {
    return <div className="SimpleToolbar">
        <div className="SimpleToolbar__title">
            {title}

        </div>
        <div className="SimpleToolbar__children">
            {children}
        </div>
    </div>
}


// linear progress
export const LinearProgress = () => {
    return <div className="LinearProgress">
        <div className="LinearProgress__indeterminate"></div>
    </div>
}

export const Chip = ({label, ...rest}) => {
    return <div className="Chip" {...rest}>{label}</div>
}

export const Typography = ({gutterBottom, component, variant, ...rest}) => {
    const TagName = component || (variant && variant.indexOf('display') > -1 ? 'h1' : 'p')
    console.log(rest)
    return <TagName className={'Typography Typography__' + variant} {...rest} />
}


export const ExpansionPanel = ({heading, children, ...rest}) => {
    return <div className="ExpansionPanel" {...rest} >
        <h1 className="ExpansionPanel__heading">{heading}</h1>
        <div className="ExpansionPanel__content">{children}</div>
    </div>
}
