import React from 'react'
import Hook from 'util/hook.cjs'
import Async from 'client/components/Async'
import {PASSKEY_BASE_URL}  from './constants'

const PasskeyContainer = (props) => <Async {...props} load={import(/* webpackChunkName: "admin" */ './containers/PasskeyContainer')} />

export default () => {
    // add routes for this extension
    Hook.on('Routes', ({routes}) => {
        routes.push({exact: true, private: true, path: PASSKEY_BASE_URL, layout:'base', layoutProps: {contentStyle:{}}, component: PasskeyContainer})
    })
}
