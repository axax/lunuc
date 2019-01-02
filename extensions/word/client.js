import React from 'react'
import Hook from 'util/hook'
import config from 'gen/config'
const {ADMIN_BASE_URL} = config
import Async from 'client/components/Async'

const WordContainer = (props) => <Async {...props}
                                        load={import(/* webpackChunkName: "word" */ './containers/WordContainer')}/>
const SubjectIcon = (props) => <Async {...props} expose="SubjectIcon"
                                      load={import(/* webpackChunkName: "word" */ '../../gensrc/ui/admin')}/>


export default () => {
    // add routes for this extension
    Hook.on('Routes', ({routes}) => {
        routes.push({exact: true, path: ADMIN_BASE_URL + '/word/:page*', component: WordContainer})
    })

    // add entry to main menu
    Hook.on('MenuMenu', ({menuItems}) => {
        menuItems.push({name: 'Words', to: ADMIN_BASE_URL + '/word', auth: true, icon: <SubjectIcon/>})
    })
}