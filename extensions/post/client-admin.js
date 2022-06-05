import React from 'react'
import Hook from 'util/hook.cjs'
import config from 'gen/config-client'

const {ADMIN_BASE_URL} = config
import Async from 'client/components/Async'
import Util from '../../client/util/index.mjs'
import {CAPABILITY_MANAGE_CMS_TEMPLATE} from '../cms/constants/index.mjs'

const PostRenderer = (props) => <Async readOnly={true} {...props}
                                       load={import(/* webpackChunkName: "post" */ './components/post/PostEditor')}/>
const EditIcon = (props) => <Async {...props} expose="EditIcon"
                                   load={import(/* webpackChunkName: "admin" */ '../../gensrc/ui/admin')}/>

export default () => {

    // add entry to main menu
    Hook.on('MenuMenu', ({menuItems, user}) => {
        if(Util.hasCapability(user, CAPABILITY_MANAGE_CMS_TEMPLATE)) {
            menuItems.push({name: 'Posts', to: ADMIN_BASE_URL + '/post', auth: true, icon: <EditIcon/>})
        }
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
