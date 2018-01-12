import Hook from 'util/hook'
import WordContainer from './containers/WordContainer'

// add routes for this extension
Hook.on('Routes', ({routes}) => {
    routes.push({exact: true, path: '/word/:page*', component: WordContainer})
})


// add entry to main menu
Hook.on('MenuMenu', ({menuEntries}) => {
    menuEntries.push({name: 'Words', to: '/word', auth: true})
})