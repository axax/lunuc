import React from 'react'
import Hook from 'util/hook'
import config from 'gen/config-client'

const {ADMIN_BASE_URL} = config
import Async from 'client/components/Async'

const PostRenderer = (props) => <Async readOnly={true} {...props}
                                       load={import(/* webpackChunkName: "post" */ './components/post/PostEditor')}/>
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

}
