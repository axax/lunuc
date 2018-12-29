import React from 'react'
import Hook from 'util/hook'
import config from 'gen/config'
const {ADMIN_BASE_URL} = config
import Async from 'client/components/Async'

const LiveSpeechTranslaterContainer = (props) => <Async {...props}
                                                   load={import(/* webpackChunkName: "livetranslator" */ './containers/LiveSpeechTranslaterContainer')}/>


// add routes for this extension
Hook.on('Routes', ({routes}) => {
    routes.push({exact: true, path: ADMIN_BASE_URL+'/translate', component: LiveSpeechTranslaterContainer})
})


// add entry to main menu
Hook.on('MenuMenu', ({menuItems}) => {
    menuItems.push({name: 'Translate', to: ADMIN_BASE_URL+'/translate', auth: true})
})