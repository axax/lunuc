
import React from 'react'

import 'antd/dist/antd.less'
//import './impl/antd.less'   // override variables here

// ui provider
export const UIProvider = ({ children, ...rest }) => {
    return <div {...rest}>{children}</div>
}

import AntButton from  'antd/lib/button'
export const Button = ({ raised, children, ...rest }) => {
    return <AntButton {...rest}>{children}</AntButton>
}

export { default as Input } from 'antd/lib/input'


// layout components
import { default as Layout } from 'antd/lib/layout'
const { Header, Content, Footer } = Layout;
export { Layout, Header as LayoutHeader, Content as LayoutContent , Footer as LayoutFooter }

// menu components
export {default as HeaderMenu} from './HeaderMenu'

// Grid
import { Row as AntRow, Col as AntCol } from 'antd/lib/grid';

export const Row = ({ spacing, ...rest }) => {
    return <AntRow gutter={spacing} {...rest} />
}
export const Col = ({ xs, sm, md, lg, ...rest }) => {
    return <AntCol xs={xs*2} sm={sm*2} md={md*2} lg={lg*2} {...rest} />
}


// Table
import AntTable from 'antd/lib/table'

export const Table = ({...rest }) => {
    return <AntTable pagination={false} {...rest} />
}
