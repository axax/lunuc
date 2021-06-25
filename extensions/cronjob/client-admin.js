import React from 'react'
import Hook from 'util/hook'
import Async from 'client/components/Async'
import {client} from 'client/middleware/graphql'


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
        if (type === 'CronJob' && action && action.key.startsWith('run')) {
            const runOnlyScript = action.key==='run_script'
            client.query({
                fetchPolicy: 'network-only',
                query: `query runCronJob($cronjobId:String,$script:String,$scriptLanguage:String,$sync:Boolean,$noEntry:Boolean){runCronJob(cronjobId:$cronjobId,script:$script,scriptLanguage:$scriptLanguage,sync:$sync,noEntry:$noEntry){status result}}`,
                variables: {
                    script: createEditForm.state.fields.script,
                    scriptLanguage: createEditForm.state.fields.scriptLanguage,
                    cronjobId: dataToEdit ? dataToEdit._id : 'none',
                    sync: runOnlyScript,
                    noEntry: runOnlyScript || dataToEdit.noEntry
                }
            }).then(response => {
                if( meta && meta.TypeContainer) {
                    meta.TypeContainer.setState({cronjobResponse: response})
                }
            }).catch(error => {
                console.log(error.message)
            })
        }
    })


    Hook.on('TypeCreateEdit', ({type, props}) => {
        if (type === 'CronJob') {
            props.actions.unshift({key: 'run', label: 'Run CronJob'})
            props.actions.unshift({key: 'run_script', label: 'Run Script'})
        }
    })


    Hook.on('TypeCreateEditChange', function ({field, type}) {
        if (type === 'CronJob' && field.name === 'execfilter') {

            client.query({
                fetchPolicy: 'network-only',
                query: 'query testExecFilter($filter:String!){testExecFilter(filter:$filter){match}}',
                variables: {
                    filter: field.value
                }
            }).then(response => {
                if (!response.data.testExecFilter.match) {
                    field.target.style.backgroundColor = 'red'
                } else {
                    field.target.style.backgroundColor = 'green'
                }
            })
        }
    })


    Hook.on('TypesContainerRender', function ({type, content}) {
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
    })
}
