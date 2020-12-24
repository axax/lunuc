import React from 'react'
import Hook from 'util/hook'
import config from 'gen/config-client'
const {ADMIN_BASE_URL} = config
import Async from 'client/components/Async'

const SearchWhileSpeechContainer = (props) => <Async {...props}
                                                   load={import(/* webpackChunkName: "speechsearch" */ './containers/SearchWhileSpeechContainer')}/>
const SearchIcon = (props) => <Async {...props} expose="SearchIcon" load={import(/* webpackChunkName: "chat" */ '../../gensrc/ui/admin')} />


export default () => {

    // add routes for this extension
    Hook.on('Routes', ({routes}) => {
        routes.push({exact: true, path: ADMIN_BASE_URL + '/search', component: SearchWhileSpeechContainer})
    })


    // add entry to main menu
    Hook.on('MenuMenu', ({menuItems}) => {
        menuItems.push({name: 'Search', to: ADMIN_BASE_URL + '/search', auth: true, icon: <SearchIcon />},)
    })
}
