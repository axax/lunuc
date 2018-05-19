import React from 'react'
import Hook from 'util/hook'
import './style.less'
import Async from 'client/components/Async'

const Login = (props) => <Async {...props} load={import(/* webpackChunkName: "admin" */ '../../client/containers/LoginContainer')} />


Hook.on('ApiResponse', ({data}) => {
    if( data.products ){
        const results = data.products.results
        if( results ){
            results.forEach(e=>{
                //e.name = 'ssss'
                //console.log(e)
            })
        }
    }
})


Hook.on('JsonDom', ({components,props}) => {
    components['Login'] = Login
})