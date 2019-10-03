import React from 'react'
import Hook from 'util/hook'
import config from 'gen/config'

const {ADMIN_BASE_URL} = config
import Async from 'client/components/Async'

const PostRenderer = (props) => <Async readOnly={true} {...props}
                                       load={import(/* webpackChunkName: "post" */ './components/post/PostEditor')}/>
const EditIcon = (props) => <Async {...props} expose="EditIcon"
                                   load={import(/* webpackChunkName: "admin" */ '../../gensrc/ui/admin')}/>
const PostContainerAsync = (props) => <Async {...props}
                                             load={import(/* webpackChunkName: "admin" */ './containers/PostContainer')}/>

export default () => {

    Hook.on('JsonDom', ({components}) => {
        components['PostRenderer'] = PostRenderer
    })

    // add routes for this extension
    Hook.on('Routes', ({routes}) => {
        routes.push({exact: true, path: ADMIN_BASE_URL + '/post/:id*', component: PostContainerAsync})
    })

    // add entry to main menu
    Hook.on('MenuMenu', ({menuItems}) => {
        menuItems.push({name: 'Posts', to: ADMIN_BASE_URL + '/post', auth: true, icon: <EditIcon/>})
    })


    Hook.on('GenericFormField', function ({field, value, result}) {
        if (field.uitype === 'richtext') {

            result.component = <PostRenderer
                key={field.name}
                onBlur={this.handleBlur}
                onChange={(e) => {
                    console.log(e, e.constructor)
                    this.handleInputChange({target: {name: field.name, value: e}})
                }}
                readOnly={false}
                imageUpload={false}
                post={{body:value}}/>
        }
    })
}
