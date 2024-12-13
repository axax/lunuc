import React from 'react'
import Hook from 'util/hook.cjs'
import Async from 'client/components/Async'
import {client} from 'client/middleware/graphql'


const SimpleDialog = (props) => <Async {...props} expose="SimpleDialog"
                                       load={import(/* webpackChunkName: "admin" */ '../../gensrc/ui/admin')}/>
const CodeEditor = (props) => <Async {...props} load={import(/* webpackChunkName: "codeeditor" */ '../../client/components/CodeEditor')}/>


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
        if (type === 'CronJob' && action && action.key && action.key.startsWith('run')) {
            const runOnlyScript = action.key==='run_script'
            client.query({
                fetchPolicy: 'network-only',
                timeout:0,
                query: `query runCronJob($cronjobId:String,$script:String,$scriptLanguage:String,$sync:Boolean,$noEntry:Boolean,$workerThread:Boolean){runCronJob(cronjobId:$cronjobId,script:$script,scriptLanguage:$scriptLanguage,sync:$sync,noEntry:$noEntry,workerThread:$workerThread){status result}}`,
                variables: {
                    script: createEditForm.state.fields.script,
                    scriptLanguage: createEditForm.state.fields.scriptLanguage,
                    workerThread: createEditForm.state.fields.workerThread,
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

    Hook.on('TypeCreateEditFormFields', ({type, formFields}) => {
        if (type === 'CronJob') {
            formFields.execfilter.extraAfter = <iframe style={{marginTop:'2rem',height:'35rem',border:'none', width:'100%'}} src="/system/info"></iframe>//<a target='_blank' href="/system/info">System Properties</a>
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
                const resultJson = this.state.cronjobResponse.data.runCronJob.result?JSON.parse(this.state.cronjobResponse.data.runCronJob.result):{}

                content.push(<SimpleDialog fullWidth={true} maxWidth="md" key="cronjobDialog" open={true} onClose={() => {this.setState({cronjobResponse: null})}}
                                           actions={[{key: 'ok', label: 'Ok'}]}
                                           title="CronJob response">
                    <h3 key="status">{this.state.cronjobResponse.data.runCronJob.status}</h3>
                    {this.state.cronjobResponse.data.runCronJob.result &&
                        Object.keys(resultJson).map(key=>{
                            if(resultJson[key]) {
                                return <><strong style={{marginBottom:'1rem'}}>{key}</strong>{resultJson[key].constructor===String?<CodeEditor height="auto" type="text">{resultJson[key]}</CodeEditor>:resultJson[key]}</>
                            }
                        })
                    }

                </SimpleDialog>)

            }
        }
    })
}
