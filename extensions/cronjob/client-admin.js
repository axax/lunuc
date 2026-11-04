import React from 'react'
import Hook from 'util/hook.cjs'
import Async from 'client/components/Async'
import Util from 'client/util/index.mjs'
import {client} from 'client/middleware/graphql'
import {CAPABILITY_RUN_SCRIPT} from 'util/capabilities.mjs'
import {cronToReadableString} from './util/cronexpression.mjs'
import {_t, registerTrs} from '../../util/i18n.mjs'
import {translations} from './translations/admin'

registerTrs(translations, 'CronJobExtension')

const SimpleDialog = (props) => <Async {...props} expose="SimpleDialog"
                                       load={() =>import(/* webpackChunkName: "admin" */ '../../gensrc/ui/admin')}/>


const CronJobResult = (props) => <Async {...props}
                                         load={() => import(/* webpackChunkName: "admin" */ './components/CronJobResult')}/>

const RunningCronJobs = (props) => <Async {...props}
                                           load={() => import(/* webpackChunkName: "admin" */ './components/RunningCronJobs')}/>

const showRunningCronJobs = (container) => {
    container.setState({
        simpleDialog: {
            title: _t('CronJob.running.title'),
            fullWidth: true,
            maxWidth: 'md',
            actions: [{key: 'close', label: _t('CronJob.running.close'), variant: 'contained'}],
            onClose: () => container.setState({simpleDialog: false}),
            children: <RunningCronJobs/>
        }
    })
}


export default () => {

    Hook.on('TypeCreateEditAction', function ({type, action, dataToEdit, createEditForm, meta}) {
        if (type === 'CronJob' && action && action.key && action.key.startsWith('run')) {
            const runOnlyScript = action.key==='run_script'
            const startTime = Date.now()
            const setResponse = (cronjobResponse) => {
                if (meta && meta.TypeContainer) {
                    meta.TypeContainer.setState({cronjobResponse: {...cronjobResponse, duration: Date.now() - startTime}})
                }
            }
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
                const runCronJob = response && response.data && response.data.runCronJob
                if (runCronJob && runCronJob.status) {
                    setResponse({status: runCronJob.status, result: runCronJob.result})
                }
            }).catch(error => {
                console.log(error.message)
                setResponse({error: error.message})
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
                name: _t('CronJob.running.show'),
                onClick: () => {
                    showRunningCronJobs(container)
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
            const cronjobResponse = this.state.cronjobResponse
            if (cronjobResponse) {
                content.push(<SimpleDialog fullWidth={true} maxWidth="md" key="cronjobDialog" open={true}
                                           onClose={() => {this.setState({cronjobResponse: null})}}
                                           actions={[{key: 'ok', label: 'Ok', variant: 'contained'}]}
                                           title={_t('CronJob.result.title')}>
                    <CronJobResult {...cronjobResponse}/>
                </SimpleDialog>)
            }
        }
    })
}