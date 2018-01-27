import Hook from 'util/hook'
import SearchWhileSpeechContainer from './containers/SearchWhileSpeechContainer'
import {ADMIN_BASE_URL} from 'gen/config'

// add routes for this extension
Hook.on('Routes', ({routes}) => {
    routes.push({exact: true, path: ADMIN_BASE_URL+'/search', component: SearchWhileSpeechContainer})
})


// add entry to main menu
Hook.on('MenuMenu', ({menuItems}) => {
    menuItems.push({name: 'Search', to: ADMIN_BASE_URL+'/search', auth: true},)
})