import React from 'react'
import Hook from 'util/hook'
import Async from 'client/components/Async'
import gql from 'graphql-tag'

const Login = (props) => <Async {...props}
                                load={import(/* webpackChunkName: "admin" */ '../../client/containers/LoginContainer')}/>


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


Hook.on('HandleTypeCreateEditDialog', function ({type, action, closeModal, client}) {
    if (type === 'CronJob' && action && action.key === 'run') {
        this.props.client.query({
            fetchPolicy: 'network-only',
            forceFetch: true,
            query: gql`query testJob($script:String){testJob(script:$script){status}}`,
            variables: {script: this.createEditForm.state.fields.script}
        }).then(response => {
            console.log(response)
        }).catch(error => {
            console.log(error.message)
        })
    }
})


Hook.on('JsonDom', ({components, props}) => {
    components['Login'] = Login
})