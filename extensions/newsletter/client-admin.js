import React from 'react'
import Hook from 'util/hook'
import {gql} from '@apollo/client'
import Async from 'client/components/Async'


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

    Hook.on('TypeCreateEditAction', function ({type, action, dataToEdit, createEditForm, client, meta}) {
        if (type === 'NewsletterMailing' && action && action.key === 'send') {

            const listIds = []
            createEditForm.state.fields.list.forEach(list=>{
                listIds.push(list._id)
            })
            const runOnlyScript = action.key==='run_script'
            let template = createEditForm.state.fields.template
            if(template.constructor === Array && template.length>0){
                template = template[0]
            }
            client.query({
                fetchPolicy: 'network-only',
                query: gql`query sendNewsletter($mailing: ID!, $subject: String!,$template: String!, $list:[ID]){sendNewsletter(mailing:$mailing,subject:$subject,template:$template,list:$list){status}}`,
                variables: {
                    mailing: dataToEdit._id,
                    subject: createEditForm.state.fields.subject,
                    template: template.slug,
                    list: listIds
            }
            }).then(response => {

                if( meta && meta._this) {
                    meta._this.setState({mailingResponse: response})
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
