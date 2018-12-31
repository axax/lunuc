import React from 'react'
import Hook from 'util/hook'
import gql from 'graphql-tag'
import Async from 'client/components/Async'


const SimpleDialog = (props) => <Async {...props} expose="SimpleDialog"
                                       load={import(/* webpackChunkName: "admin" */ '../../gensrc/ui/admin')}/>

export default () => {

    Hook.on('ApiResponse', ({data}) => {
        if (data.products) {
            const results = data.products.results
            if (results) {
                results.forEach(e => {
                    //e.name = 'ssss'
                    //console.log(e)
                })
            }
        }
    })

    Hook.on('TypeCreateEditDialogAction', function ({type, action}) {
        if (type === 'CronJob' && action && action.key === 'run') {
            this.props.client.query({
                fetchPolicy: 'network-only',
                query: gql`query testJob($cronjobId:String!,$script:String){testJob(cronjobId:$cronjobId,script:$script){status}}`,
                variables: {
                    script: this.createEditForm.state.fields.script,
                    cronjobId: this.state.dataToEdit ? this.state.dataToEdit._id : 'none'
                }
            }).then(response => {
                this.setState({cronjobResponse: response})
            }).catch(error => {
                console.log(error.message)
            })
        }
    })


    Hook.on('TypeCreateEditDialog', ({type, props}) => {
        if (type === 'CronJob') {
            props.actions.unshift({key: 'run', label: 'Run CronJob'})
        }
    })


    Hook.on('TypeCreateEditDialogChange', function ({field, type}) {
        if (type === 'CronJob' && field.name === 'execfilter') {

            this.props.client.query({
                fetchPolicy: 'network-only',
                query: gql`query testExecFilter($filter:String!){testExecFilter(filter:$filter){match}}`,
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
            if (this.state.cronjobResponse && this.state.cronjobResponse.data.testJob && this.state.cronjobResponse.data.testJob.status) {
                content.push(<SimpleDialog key="cronjobDialog" open={true} onClose={() => {
                    this.setState({cronjobResponse: null})
                }}
                                           actions={[{key: 'ok', label: 'Ok'}]}
                                           title="CronJob response">
                    {this.state.cronjobResponse.data.testJob.status}
                </SimpleDialog>)

            }
        }
    })
}