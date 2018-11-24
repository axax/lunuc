import React from 'react'
import Hook from 'util/hook'
import gql from 'graphql-tag'
import {
    SimpleDialog
} from 'ui/admin'

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

Hook.on('TypeCreateEditDialog', ({type, props}) => {
    if (type === 'CronJob') {
        props.actions.unshift({key: 'run', label: 'Run CronJob'})
    }
})


Hook.on('HandleTypeCreateEditDialog', function ({type, action}) {
    if (type === 'CronJob' && action && action.key === 'run') {
        this.props.client.query({
            fetchPolicy: 'network-only',
            forceFetch: true,
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


Hook.on('JsonDom', ({components, props}) => {
    components['Login'] = Login
})