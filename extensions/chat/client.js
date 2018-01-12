import Hook from 'util/hook'
import ChatContainer from './containers/ChatContainer'

// add routes for this extension
Hook.on('Routes', ({routes}) => {
    routes.push({exact: true, path: '/chat/:id*', component: ChatContainer})
})


// add entry to main menu
Hook.on('MenuMenu', ({menuEntries}) => {
    menuEntries.push({name: 'My chats', to: '/chat', auth: true})
})