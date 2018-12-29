import React from 'react'
import Hook from 'util/hook'
import config from 'gen/config'
const {ADMIN_BASE_URL} = config
import Async from 'client/components/Async'

const SearchWhileSpeechContainer = (props) => <Async {...props}
                                                   load={import(/* webpackChunkName: "speechsearch" */ './containers/SearchWhileSpeechContainer')}/>


// add routes for this extension
Hook.on('Routes', ({routes}) => {
    routes.push({exact: true, path: ADMIN_BASE_URL+'/search', component: SearchWhileSpeechContainer})
})


// add entry to main menu
Hook.on('MenuMenu', ({menuItems}) => {
    menuItems.push({name: 'Search', to: ADMIN_BASE_URL+'/search', auth: true},)
})