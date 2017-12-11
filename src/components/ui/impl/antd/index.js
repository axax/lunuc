
import React from 'react'

import 'antd/dist/antd.less'
//import './impl/antd.less'   // override variables here

// ui provider
export const UIProvider = ({ children, ...rest }) => {
    return <div {...rest}>{children}</div>
}

import AntButton from  'antd/lib/Button'
export const Button = ({ raised, children, ...rest }) => {
    return <AntButton {...rest}>{children}</AntButton>
}

export { default as Input } from 'antd/lib/Input'


// layout components
import { default as Layout } from 'antd/lib/Layout'
const { Header, Content, Footer } = Layout;
export { Layout, Header as LayoutHeader, Content as LayoutContent , Footer as LayoutFooter }

// menu components
export {default as HeaderMenu} from './HeaderMenu'

// Grid
export { Row, Col } from 'antd/lib/grid';
