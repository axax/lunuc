import Hook from 'util/hook'
import LiveSpeechTranslaterContainer from './containers/LiveSpeechTranslaterContainer'
import {ADMIN_BASE_URL} from 'gen/config'

// add routes for this extension
Hook.on('Routes', ({routes}) => {
    routes.push({exact: true, path: ADMIN_BASE_URL+'/translate', component: LiveSpeechTranslaterContainer})
})


// add entry to main menu
Hook.on('MenuMenu', ({menuItems}) => {
    menuItems.push({name: 'Translate', to: ADMIN_BASE_URL+'/translate', auth: true})
})