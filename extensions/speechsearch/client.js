import Hook from 'util/hook'
import SearchWhileSpeechContainer from './containers/SearchWhileSpeechContainer'

// add routes for this extension
Hook.on('Routes', ({routes}) => {
    routes.push({exact: true, path: '/search', component: SearchWhileSpeechContainer})
})


// add entry to main menu
Hook.on('MenuMenu', ({menuEntries}) => {
    menuEntries.push({name: 'Search', to: '/search', auth: true},)
})