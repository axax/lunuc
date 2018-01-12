import Hook from 'util/hook'
import PostContainer from './containers/PostContainer'

// add routes for this extension
Hook.on('Routes', ({routes}) => {
    routes.push({exact: true, path: '/post/:id*', component: PostContainer})
})


// add entry to main menu
Hook.on('MenuMenu', ({menuEntries}) => {
    menuEntries.push({name: 'Posts', to: '/post', auth: true})
})