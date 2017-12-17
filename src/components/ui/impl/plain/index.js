import './style.less'

import React from 'react'

// ui provider
export const UIProvider = ({ children, ...rest }) => {
    return <div {...rest}>{children}</div>
}


export const Button = ({ ...rest }) => {
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

// grid
export const Row = ({ ...rest }) => {
    return <div style={{display:'flex'}} {...rest} />
}
export const Col = ({ span, ...rest }) => {
    return <div style={{flex: '0 0 '+(100*span/24)+'%'}} {...rest} />
}

// table
export const Table = ({columns,dataSource, ...rest }) => {
    return <tale {...rest}>
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
    </tale>
}