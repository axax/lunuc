import React from 'react'
import Hook from 'util/hook.cjs'
import './style.global.less'
import {lazy} from 'client/components/Async'

const Login = lazy(() => import(/* webpackChunkName: "adminLogin" */ '../../client/containers/LoginContainer'))
const System = lazy(() => import(/* webpackChunkName: "admin" */ './containers/System'))


export default () => {

    Hook.on('JsonDom', ({components}) => {
        components['Login'] = Login
    })

    Hook.on('ExtensionSystemInfo', ({extension}) => {
        if (extension.name === 'Shop') {
            extension.systemContent = <System/>
        }
    })

    Hook.on('CMSSlug', ({match}) => {
        if (match.params.slug) {
            // this is a product page
            // allow pretty url
            if (match.params.slug.startsWith('shop/list/')) {
                match.params.slug = 'shop/list'
            } else if (match.params.slug.startsWith('shop/detail/')) {
                match.params.slug = 'shop/detail'
            }
        }
    })
}
