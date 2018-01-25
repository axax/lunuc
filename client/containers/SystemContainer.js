import React from 'react'
import PropTypes from 'prop-types'
import extensions from 'gen/extensions'
import BaseLayout from '../components/layout/BaseLayout'
import {Typography, ExpansionPanel, Button} from 'ui/admin'
import {withApollo} from 'react-apollo'
import {CACHE_KEY} from 'client/middleware/cache'
import ApolloClient from 'apollo-client'

class SystemContainer extends React.Component {


    render() {
        return <BaseLayout>
            <Typography type="display2" gutterBottom>System</Typography>
            <Typography type="display1" component="h2" gutterBottom>Extensions</Typography>
            {
                Object.keys(extensions).map(k => {
                    const value = extensions[k]

                    return <ExpansionPanel heading={<Typography type="headline">{value.name}</Typography>} key={k}>
                        <div><Typography type="body1" gutterBottom>{value.description}</Typography></div>
                        <Typography type="caption" gutterBottom>Types</Typography>
                    </ExpansionPanel>
                })
            }
            <Typography type="display1" component="h2" gutterBottom>Cache</Typography>

            <Button color="secondary" onClick={e => {
                this.props.client.resetStore().then(() => {
                    console.log('cache cleared')
                })
            } } raised>Clear API cache</Button>

        </BaseLayout>
    }
}


SystemContainer.propTypes = {
    client: PropTypes.instanceOf(ApolloClient).isRequired
}


export default withApollo(SystemContainer)
