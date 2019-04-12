import React from 'react'
import Hook from 'util/hook'
import './style.global.less'
import Async from 'client/components/Async'

const Login = (props) => <Async {...props}
                                load={import(/* webpackChunkName: "admin" */ '../../client/containers/LoginContainer')}/>
const System = (props) => <Async {...props} load={import(/* webpackChunkName: "admin" */ './containers/System')}/>


export default () => {

    Hook.on('ApiResponse', ({data}) => {
        if (data.products) {
            const results = data.products.results
            if (results) {
                results.forEach(e => {
                    //e.name = 'ssss'
                    //console.log(e)
                })
            }
        }
    })


    Hook.on('JsonDom', ({components}) => {
        components['Login'] = Login
    })
    Hook.on('ExtensionSystemInfo', ({extension}) => {
        if (extension.name === 'Shop') {
            extension.systemContent = <System />
        }
    })
}