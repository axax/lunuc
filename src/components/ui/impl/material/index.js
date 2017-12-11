import './style.less'

import React from 'react'

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

export const Input = ({ ...rest }) => {
    return <MaterialTextField {...rest} />
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
