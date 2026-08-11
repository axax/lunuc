import React from 'react'
import Hook from 'util/hook.cjs'
import Async from 'client/components/Async'
import Util from 'client/util/index.mjs'
import {client} from 'client/middleware/graphql'
import {CAPABILITY_RUN_SCRIPT} from 'util/capabilities.mjs'
import {cronToReadableString} from './util/cronexpression.mjs'
import {registerTrs} from '../../util/i18n.mjs'
import {translations} from './translations/admin'

registerTrs(translations, 'CronJobExtension')

const SimpleDialog = (props) => <Async {...props} expose="SimpleDialog"
                                       load={() =>import(/* webpackChunkName: "admin" */ '../../gensrc/ui/admin')}/>
const CodeEditor = (props) => <Async {...props} load={() =>import(/* webpackChunkName: "codeeditor" */ '../../client/components/CodeEditor')}/>


const formatRuntime = (ms) => {
    if (!ms && ms !== 0) {
        return '-'
    }
    const seconds = Math.floor(ms / 1000)
    if (seconds < 60) {
        return `${seconds}s`
    }
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) {
        return `${minutes}m ${seconds % 60}s`
    }
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

const cellStyle = {padding: '0.4rem 0.8rem', borderBottom: '1px solid rgba(0,0,0,0.12)', textAlign: 'left'}

const renderRunningCronJobs = (jobs, container) => {
    if (!jobs.length) {
        return <div>No cronjob is currently running.</div>
    }

    return <div>
        <table style={{width: '100%', borderCollapse: 'collapse'}}>
            <thead>
            <tr>
                <th style={cellStyle}>Name</th>
                <th style={cellStyle}>Id</th>
                <th style={cellStyle}>Started</th>
                <th style={cellStyle}>Runtime</th>
                <th style={cellStyle}></th>
            </tr>
            </thead>
            <tbody>
            {jobs.map(job => <tr key={job.cronjobId}>
                <td style={cellStyle}>{job.name || '-'}</td>
                <td style={cellStyle}><small>{job.cronjobId}</small></td>
                <td style={cellStyle}>{job.startTime ? new Date(job.startTime).toLocaleString() : '-'}</td>
                <td style={cellStyle}>{formatRuntime(job.runtime)}</td>
                <td style={cellStyle}>
                    <button onClick={() => abortRunningCronJob(job.cronjobId, container)}
                            title={job.killable ? 'Terminate the job' : 'Only the lock gets released, the script keeps running'}>
                        {job.killable ? 'Abort' : 'Release lock'}
                    </button>
                </td>
            </tr>)}
            </tbody>
        </table>
        <button style={{marginTop: '1rem'}} onClick={() => loadRunningCronJobs(container)}>Refresh</button>
    </div>
}

const loadRunningCronJobs = (container) => {
    client.query({
        fetchPolicy: 'network-only',
        query: '{getRunningCronJobs{cronjobId executionId name startTime runtime killable}}'
    }).then(response => {
        const jobs = (response.data && response.data.getRunningCronJobs) || []
        container.setState({
            simpleDialog: {
                title: 'Running CronJobs',
                fullWidth: true,
                maxWidth: 'md',
                children: renderRunningCronJobs(jobs, container)
            }
        })
    }).catch(error => {
        container.setState({simpleDialog: {title: 'Running CronJobs', children: error.message}})
    })
}

const abortRunningCronJob = (cronjobId, container) => {
    client.query({
        fetchPolicy: 'network-only',
        query: 'query abortCronJob($cronjobId:String!){abortCronJob(cronjobId:$cronjobId){success status}}',
        variables: {cronjobId}
    }).then(() => {
        // reload the list so the dialog reflects the new state
        loadRunningCronJobs(container)
    }).catch(error => {
        container.setState({simpleDialog: {title: 'Running CronJobs', children: error.message}})
    })
}


export default () => {

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


    Hook.on('TypeTableAction', function ({type, actions}) {
        if (type === 'CronJob') {
            if (!Util.hasCapability({userData: _app_.user}, CAPABILITY_RUN_SCRIPT)) {
                return
            }

            const container = this

            actions.unshift({
                name: 'Show running CronJobs',
                onClick: () => {
                    loadRunningCronJobs(container)
                }
            })
        }
    })


    Hook.on('TypeCreateEdit', ({type, props}) => {
        if (type === 'CronJob') {
            props.actions.unshift({key: 'run', label: 'Run CronJob'})
            props.actions.unshift({key: 'run_script', label: 'Run Script'})
        }
    })

    Hook.on('TypeCreateEditFormFields', ({type, formFields, dataToEdit}) => {
        if (type === 'CronJob') {
            formFields.execfilter.extraAfter = <iframe style={{marginTop:'2rem',height:'35rem',border:'none', width:'100%'}} src="/system/info"></iframe>//<a target='_blank' href="/system/info">System Properties</a>
            if(dataToEdit) {
                formFields.expression.helperText = cronToReadableString(dataToEdit.expression)
            }
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