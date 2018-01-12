import Hook from 'util/hook'
import LiveSpeechTranslaterContainer from './containers/LiveSpeechTranslaterContainer'

// add routes for this extension
Hook.on('Routes', ({routes}) => {
    routes.push({exact: true, path: '/translate', component: LiveSpeechTranslaterContainer})
})


// add entry to main menu
Hook.on('MenuMenu', ({menuEntries}) => {
    menuEntries.push({name: 'Translate', to: '/translate', auth: true})
})