import React from 'react'
import Async from 'client/components/Async'
import config from 'gen/config-client'
const {ADMIN_BASE_URL} = config
import Hook from 'util/hook.cjs'
const TypesContainer = (props) => <Async {...props}
                                         load={import(/* webpackChunkName: "admin" */ '../../client/containers/TypesContainer')}/>

// add routes
Hook.on('Routes', ({routes, container}) => {
    routes.push({
        private: true,
        exact: true,
        path: ADMIN_BASE_URL + '/medias/:page*',
        layout:'base',
        component: (p) => {
            return <TypesContainer baseUrl={ADMIN_BASE_URL + "/medias/"} fixType="Media"
                                   title="Media" {...p} />
        }
    })
}, 99)

export default () => {


}
