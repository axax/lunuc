import './style.less'

import React from 'react'

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