import Hook from 'util/hook'
import PostContainer from './containers/PostContainer'
import {ADMIN_BASE_URL} from 'gen/config'

// add routes for this extension
Hook.on('Routes', ({routes}) => {
    routes.push({exact: true, path: ADMIN_BASE_URL+'/post/:id*', component: PostContainer})
})


// add entry to main menu
Hook.on('MenuMenu', ({menuItems}) => {
    menuItems.push({name: 'Posts', to: ADMIN_BASE_URL+'/post', auth: true})
})