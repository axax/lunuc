import React from 'react'

//import antStyles from 'antd/dist/antd.less'
//import styles from './style.less'
//import './impl/antd.less'   // override variables here

// ui provider
export const UIProvider = ({children, ...rest}) => {
    return <div id="uiProvider" {...rest}>{children}</div>
}

import AntButton from  'antd/lib/button'
export const Button = ({raised, children, ...rest}) => {
    return <AntButton {...rest}>{children}</AntButton>
}

export const DeleteIconButton = ({...rest}) => {
    // map type to color
    return <AntButton shape="circle" icon="delete" {...rest} />
}


// input & textarea
import AntInput from  'antd/lib/input'
const {TextArea} = AntInput;

export {AntInput as TextField}
export {TextArea as Textarea}


// Checkbox
import {default as AntCheckbox} from  'antd/lib/checkbox/Checkbox'
export const Checkbox = ({...rest}) => {
    return <AntCheckbox {...rest} />
}

//Switch
import AntSwitch from  'antd/lib/Switch'
export const Switch = ({label, ...rest}) => {
    return <div><AntSwitch {...rest} /> {label}</div>
}

// layout components
import {default as Layout} from 'antd/lib/layout'
const {Header, Content, Footer} = Layout;
export {Layout, Header as LayoutHeader, Content as LayoutContent, Footer as LayoutFooter}

// menu components
export {default as HeaderMenu} from './HeaderMenu'

// pagination
export {default as Pagination} from 'antd/lib/pagination'

// Grid
import {Row as AntRow, Col as AntCol} from 'antd/lib/grid';

export const Row = ({spacing, ...rest}) => {
    return <AntRow gutter={spacing} {...rest} />
}
export const Col = ({xs, sm, md, lg, ...rest}) => {
    return <AntCol xs={xs * 2} sm={sm * 2} md={md * 2} lg={lg * 2} {...rest} />
}


// Table
import AntTable from 'antd/lib/table'
import AntPagination from 'antd/lib/pagination'
export const Table = ({count, rowsPerPage, page, onChangePage, onChangeRowsPerPage, ...rest}) => {
    return <div>
        <AntTable pagination={false} {...rest} />
        <AntPagination onChange={(page) => onChangePage(page)} defaultCurrent={page} total={count}/>
    </div>
}


// dialog
import {Modal as AntModal} from 'antd'

export const Dialog = ({children, onClose, actions, open, ...rest}) => {

    return <AntModal
        visible={open}
        onCancel={onClose}
        footer={
            actions.map((action, i) => {
                return (
                    <Button key={i} onClick={() => {
                        onClose(action)
                    }} type={action.type}>
                        {action.label}
                    </Button>
                )
            })
        }
        onClose={onClose}
        {...rest}>
        {children}
    </AntModal>
}


// drawer layout
export {default as DrawerLayout} from './DrawerLayout'


// divider
export {default as Divider} from 'antd/lib/divider'


// list
import {default as AntMenu} from 'antd/lib/menu'

export const MenuList = ({children,...rest}) => {
    const clicks = {}
    if( children.type.name == 'MenuListItem'){
        clicks['item_0']=children.props.onClick
    }
    return <AntMenu onClick={(e)=>{ if(clicks[e.key] ){ clicks[e.key].apply()} }} theme="dark" mode="inline" {...rest}>{children}</AntMenu>
}

export class MenuListItem extends React.Component {
    render() {
        const {primary, ...rest} = this.props
        return <AntMenu.Item {...rest}>
            <span>{primary}</span>
        </AntMenu.Item>
    }
}

// snackbar
import {notification} from 'antd';
export const Snackbar = ({message, ...rest}) => {
    notification.open({
        message
    })
    return <div></div>
}

