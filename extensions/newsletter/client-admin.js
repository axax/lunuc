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
                query: gql`query sendNewsletter($subject: String!,$template: String!, $list:[ID]){sendNewsletter(subject:$subject,template:$template,list:$list){status}}`,
                variables: {
                    subject: createEditForm.state.fields.subject,
                    template: template.slug,
                    list: listIds
            }
            }).then(response => {
                console.log(response)
            }).catch(error => {
                console.log(error.message)
            })
        }
    })


    Hook.on('TypeCreateEdit', ({type, props}) => {
        if (type === 'NewsletterMailing') {
            props.actions.unshift({key: 'send', label: 'Send Newsletter'})
        }
    })


    /*Hook.on('TypesContainerRender', function ({type, content}) {
        if (type === 'CronJob') {
            if (this.state.cronjobResponse && this.state.cronjobResponse.data.runCronJob && this.state.cronjobResponse.data.runCronJob.status) {
                content.push(<SimpleDialog key="cronjobDialog" open={true} onClose={() => {
                    this.setState({cronjobResponse: null})
                }}
                                           actions={[{key: 'ok', label: 'Ok'}]}
                                           title="CronJob response">
                    <h3 key="status">{this.state.cronjobResponse.data.runCronJob.status}</h3>
                    {this.state.cronjobResponse.data.runCronJob.result &&
                    <pre key="result">
                        {JSON.stringify(JSON.parse(this.state.cronjobResponse.data.runCronJob.result),null,2)}
                    </pre>
                    }

                </SimpleDialog>)

            }
        }
    })*/
}
