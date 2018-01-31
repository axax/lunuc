import Hook from 'util/hook'
import WordContainer from './containers/WordContainer'
import {ADMIN_BASE_URL} from 'gen/config'

// add routes for this extension
Hook.on('Routes', ({routes}) => {
    routes.push({exact: true, path: ADMIN_BASE_URL+'/word/:page*', component: WordContainer})
})


// add entry to main menu
Hook.on('MenuMenu', ({menuItems}) => {
    menuItems.push({name: 'Words', to: ADMIN_BASE_URL+'/word', auth: true})
})



Hook.on('Types', ({types}) => {
    types.Word = {
        "name": "Word",
        "usedBy": ["Words extension"],
        "fields": [
            {
                "name": "de"
            },
            {
                "name": "en",
                "required": true
            }
        ]
    }
})
