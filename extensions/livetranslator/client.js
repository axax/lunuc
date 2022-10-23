import React from 'react'
import Hook from 'util/hook.cjs'
import config from 'gen/config-client'
const {ADMIN_BASE_URL} = config
import Async from 'client/components/Async'

const LiveSpeechTranslaterContainer = (props) => <Async {...props}
                                                   load={import(/* webpackChunkName: "livetranslator" */ './containers/LiveSpeechTranslaterContainer')}/>
const TranslateIcon = (props) => <Async {...props} expose="TranslateIcon" load={import(/* webpackChunkName: "livetranslator" */ '../../gensrc/ui/admin')} />

export default () => {

    // add routes for this extension
    Hook.on('Routes', ({routes}) => {
        routes.push({exact: true, path: ADMIN_BASE_URL + '/translate', layout:'base', component: LiveSpeechTranslaterContainer})
    })

    // add entry to main menu
    Hook.on('MenuMenu', ({menuItems}) => {
        menuItems.push({name: 'Translate', to: ADMIN_BASE_URL + '/translate', auth: true, icon: <TranslateIcon />})
    })
}
