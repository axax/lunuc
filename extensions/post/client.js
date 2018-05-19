import React from 'react'
import Hook from 'util/hook'
import config from 'gen/config'
const {ADMIN_BASE_URL} = config
import Async from 'client/components/Async'

const PostContainerAsync = (props) => <Async {...props} load={import(/* webpackChunkName: "post" */ './containers/PostContainer')} />


// add routes for this extension
Hook.on('Routes', ({routes}) => {
    routes.push({exact: true, path: ADMIN_BASE_URL+'/post/:id*', component: PostContainerAsync})
})


// add entry to main menu
Hook.on('MenuMenu', ({menuItems}) => {
    menuItems.push({name: 'Posts', to: ADMIN_BASE_URL+'/post', auth: true})
})