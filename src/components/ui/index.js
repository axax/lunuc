// this is like an interface for ui elements
// all components import from this file
// just copy the content of one of the implementation from the impl folder
// and replace the content of this file

import 'antd/dist/antd.less'
//import './impl/antd.less'   // override variables here

export { default as Button } from 'antd/lib/Button'

export { default as Input } from 'antd/lib/Input'
