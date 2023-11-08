import React from 'react'
import Hook from 'util/hook.cjs'
import Async from 'client/components/Async'
import {client} from 'client/middleware/graphql'

import {registerTrs} from '../../util/i18n.mjs'
import {translations} from './translations/admin'
registerTrs(translations, 'Newsletter')

const SimpleDialog = (props) => <Async {...props} expose="SimpleDialog"
                                       load={import(/* webpackChunkName: "admin" */ '../../gensrc/ui/admin')}/>

export default () => {

    /*Hook.on('ApiResponse', ({data}) => {
        if (data.products) {
            const results = data.products.results
            if (results) {
                results.forEach(e => {
                    //e.name = 'ssss'
                    //console.log(e)
                })
            }
        }
    })*/

    Hook.on('TypeCreateEditAction', function ({type, action, dataToEdit, createEditForm, meta}) {
        if (type === 'NewsletterMailing' && action && action.key === 'send') {

            const listIds = []

            const fieldsForSend = createEditForm.state.fields
            fieldsForSend.list.forEach(list=>{
                listIds.push(list._id)
            })

            const usersIds = []

            if(fieldsForSend.users) {
                fieldsForSend.users.forEach(user => {
                    usersIds.push(user._id)
                })
            }


            let template = fieldsForSend.template
            if(template && template.constructor === Array && template.length>0){
                template = template[0]
            }

            client.query({
                fetchPolicy: 'network-only',
                query: 'query sendNewsletter($mailing: ID!, $subject: LocalizedStringInput!,$template: String, $list:[ID],$users:[ID],$unsubscribeHeader:Boolean,$batchSize: Float, $host: String, $text: LocalizedStringInput, $html: LocalizedStringInput){sendNewsletter(mailing:$mailing,subject:$subject,template:$template,list:$list,users:$users,unsubscribeHeader:$unsubscribeHeader,batchSize:$batchSize,host:$host,text:$text,html:$html){status}}',
                variables: {
                    mailing: dataToEdit._id,
                    subject: fieldsForSend.subject,
                    batchSize: fieldsForSend.batchSize,
                    host: fieldsForSend.host || '',
                    text: fieldsForSend.text,
                    html: fieldsForSend.html,
                    template: template?template.slug: undefined,
                    list: listIds,
                    users: usersIds,
                    unsubscribeHeader: fieldsForSend.unsubscribeHeader
            }
            }).then(response => {

                if( meta && meta.TypeContainer) {
                    meta.TypeContainer.setState({mailingResponse: response})
                }
            }).catch(error => {
                console.log(error.message)
            })
        }
    })


    Hook.on('TypeCreateEdit', ({type, props, dataToEdit}) => {
        if (type === 'NewsletterMailing' && dataToEdit && dataToEdit._id) {
            props.actions.unshift({key: 'send', label: 'Send Newsletter'})
        }
    })


    Hook.on('TypesContainerRender', function ({type, content}) {
        if (type === 'NewsletterMailing') {
            if (this.state.mailingResponse && this.state.mailingResponse.data.sendNewsletter && this.state.mailingResponse.data.sendNewsletter.status) {
                content.push(<SimpleDialog key="mailingResponseDialog" open={true} onClose={() => {
                    this.setState({mailingResponse: null})
                }}
                                           actions={[{key: 'ok', label: 'Ok'}]}
                                           title="Mailing response">
                    <h3 key="status">{this.state.mailingResponse.data.sendNewsletter.status}</h3>
                    {this.state.mailingResponse.data.sendNewsletter.result &&
                    <pre key="result">
                        {JSON.stringify(JSON.parse(this.state.mailingResponse.data.sendNewsletter.result),null,2)}
                    </pre>
                    }

                </SimpleDialog>)

            }
        }
    })
}
