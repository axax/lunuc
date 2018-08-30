import React from 'react'
import PropTypes from 'prop-types'
import extensions from 'gen/extensions'
import BaseLayout from '../components/layout/BaseLayout'
import {Typography, ExpansionPanel, Button, SimpleSwitch} from 'ui/admin'
import {withApollo} from 'react-apollo'
import {CACHE_KEY} from 'client/middleware/cache'
import ApolloClient from 'apollo-client'

class SystemContainer extends React.Component {

    constructor(props) {
        super(props)
        const extensionStates = {}
        Object.keys(extensions).map(k => {
            extensionStates[k] = {enabled: true}
        })
        this.state = {extensionStates}
    }

    setExtensionState(k, e) {
        e.preventDefault()
        e.stopPropagation()
        console.log(k, e.target.checked)
        this.setState({extensionStates: {...this.state.extensionStates, [k]: {enabled: e.target.checked}}})
    }

    render() {
        const {extensionStates} = this.state

        return <BaseLayout>
            <Typography variant="display2" gutterBottom>System</Typography>
            <Typography variant="display1" component="h2" gutterBottom>Extensions</Typography>
            {
                Object.keys(extensions).map(k => {
                    const extension = extensions[k]
                    return <ExpansionPanel heading={<Typography variant="title"><SimpleSwitch color="primary"
                                                                                              checked={extensionStates[k].enabled}
                                                                                              onClick={this.setExtensionState.bind(this, k)}
                                                                                              contrast/>{extension.name}
                    </Typography>} key={k}>
                        <div>

                            <Typography variant="body1" gutterBottom>{extension.description}</Typography>
                            { extension.options && extension.options.types &&
                            <ul>
                                {extension.options.types.map(type => {
                                    return <li key={type.name}>{type.name} {type.fields && type.fields.length &&
                                    <ul>{type.fields.map(field => {
                                        return <li key={field.name}>{field.name}</li>
                                    })}</ul>}</li>
                                })}
                            </ul>
                            }
                        </div>
                    </ExpansionPanel>
                })
            }
            <Typography variant="display1" component="h2" gutterBottom>Cache</Typography>

            <Button color="secondary" onClick={e => {
                this.props.client.resetStore().then(() => {
                    console.log('cache cleared')
                })
            } } variant="raised">Clear API cache</Button>

        </BaseLayout>
    }
}


SystemContainer.propTypes = {
    client: PropTypes.instanceOf(ApolloClient).isRequired
}


export default withApollo(SystemContainer)
