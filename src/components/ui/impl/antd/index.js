

import 'antd/dist/antd.less'
//import './impl/antd.less'   // override variables here

export { default as Button } from 'antd/lib/Button'

export { default as Input } from 'antd/lib/Input'


// layout components
import { default as Layout } from 'antd/lib/Layout'
const { Header, Content, Footer } = Layout;
export { Layout, Header as LayoutHeader, Content as LayoutContent , Footer as LayoutFooter }

// menu components
export {default as HeaderMenu} from './HeaderMenu'
