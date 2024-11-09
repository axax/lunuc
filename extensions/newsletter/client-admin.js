import React from 'react'
import Hook from 'util/hook.cjs'
import Async from 'client/components/Async'
import {client} from 'client/middleware/graphql'

import {registerTrs,_t} from '../../util/i18n.mjs'
import {translations} from './translations/admin'
import {openWindow} from '../../client/util/window'
import Util from '../../client/util/index.mjs'
import {CAPABILITY_MANAGE_TYPES} from '../../util/capabilities.mjs'
import GenericForm from '../../client/components/GenericForm'
import {referencesToIds} from '../../util/typesAdmin.mjs'

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

    Hook.on('TypeTable', ({type, dataSource, data, container}) => {
        if (type === 'NewsletterMailing' && data.results.length > 0) {
            dataSource.forEach((row, i) => {
                const item = data.results[i]
                if(item.state=='error') {
                    row.style = {backgroundColor: 'red'}
                }else if(item.state=='running') {
                    row.style = {backgroundColor: 'rgba(250, 244, 211, 0.75)'}
                }else if(item.state=='finished') {
                    row.style = {backgroundColor: 'rgba(5, 148, 10, 0.64)'}
                }
            })
        }
    })



    Hook.on('TypeCreateEditAction', function ({type, action, dataToEdit, createEditForm, meta, typeEdit}) {
        if (type === 'NewsletterMailing' && action) {

            if(action.key === 'preview') {
                const dataForPreview = Object.assign({},dataToEdit)
                delete dataForPreview.users
                delete dataForPreview.mailSettings
                openWindow({url:`/${dataToEdit.template.slug}?preview=true&context=${encodeURIComponent(JSON.stringify(dataForPreview))}`})

            }else if(action.key === 'test') {

                meta.TypeContainer.setState({simpleDialog:{title: _t('NewsletterMailing.sendTest'),
                        actions: [{key: 'cancel', label: _t('core.cancel')},{key: 'yes', label: _t('core.ok')}],
                        onClose: (action) => {
                            if(action.key==='yes'){
                                const validationState = this.emailForm.validate()
                                console.log(this.emailForm.state.fields)
                                if(validationState.isValid && this.emailForm.state.fields.email){
                                    typeEdit.handleSaveData({key:'save'})

                                    client.query({
                                        fetchPolicy: 'network-only',
                                        query: 'query sendNewsletter($mailing: ID!, $testReceiver: String){sendNewsletter(mailing:$mailing,testReceiver:$testReceiver){status}}',
                                        variables: {
                                            mailing: dataToEdit._id,
                                            testReceiver:this.emailForm.state.fields.email
                                        }
                                    }).then(response => {

                                        if (meta && meta.TypeContainer) {
                                            meta.TypeContainer.setState({mailingResponse: response})
                                        }
                                    }).catch(error => {
                                        console.log(error.message)
                                    })


                                    meta.TypeContainer.setState({simpleDialog: false})


                                }else{


                                }

                            }else {
                                meta.TypeContainer.setState({simpleDialog: false})
                            }
                        },
                        children: <>{_t('NewsletterMailing.sendTest.text')}
                            <GenericForm onRef={(e) => {
                                this.emailForm = e
                             }} primaryButton={false}
                             fields={{
                                 email: {
                                     fullWidth: true,
                                     required:true,
                                     label: 'Email'
                                 }
                             }}/></>}})


            }else if(action.key === 'start') {

                meta.TypeContainer.setState({simpleDialog:{title: _t('NewsletterMailing.startNewsletter'),
                        actions: [{key: 'cancel', label: _t('core.cancel')},{key: 'yes', label: _t('core.yes')}],
                        onClose: (action) => {
                            if(action.key==='yes'){
                                createEditForm.state.fields.active = true
                                createEditForm.state.fields.state = 'running'

                                typeEdit.handleSaveData({key:'save_close'})

                            }
                            meta.TypeContainer.setState({simpleDialog: false})
                        },
                        children: _t('NewsletterMailing.startNewsletter.question')}})

            }else if(action.key === 'send') {

                const fieldsForSend = referencesToIds(createEditForm.state.fields,type)



                let template = createEditForm.state.fields.template
                if (template && template.constructor === Array && template.length > 0) {
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
                        template: template ? template.slug : undefined,
                        list: fieldsForSend.list,
                        users: fieldsForSend.users,
                        unsubscribeHeader: fieldsForSend.unsubscribeHeader
                    }
                }).then(response => {

                    if (meta && meta.TypeContainer) {
                        meta.TypeContainer.setState({mailingResponse: response})
                    }
                }).catch(error => {
                    console.log(error.message)
                })
            }
        }
    })


    Hook.on('TypeCreateEdit', ({type, props, dataToEdit}) => {
        if (type === 'NewsletterMailing' && dataToEdit && dataToEdit._id) {


            props.actions.unshift({variant:'contained',key: 'start', label: _t('NewsletterMailing.startNewsletter')})

            props.actions.unshift({variant:'outlined', type: 'secondary',key: 'test', label: _t('NewsletterMailing.sendTest')})

            if(dataToEdit.template && dataToEdit.template.slug){
                props.actions.unshift({variant:'outlined', type: 'secondary',key: 'preview', label: _t('NewsletterMailing.preview')})
            }


            if(Util.hasCapability({userData: _app_.user}, CAPABILITY_MANAGE_TYPES)) {
                props.actions.unshift({key: 'send', label: _t('NewsletterMailing.sendNewsletter')})
            }
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
