import React from 'react'
import PropTypes from 'prop-types'
import extensions from 'gen/extensions'
import BaseLayout from '../components/layout/BaseLayout'
import {withStyles, Typography, ExpansionPanel, Button, SimpleSwitch, ContentBlock} from 'ui/admin'
import {withApollo} from 'react-apollo'
import {CACHE_KEY} from 'client/middleware/cache'
import ApolloClient from 'apollo-client'
import Hook from 'util/hook'


const styles = theme => ({
    column: {
        flexBasis: '50%',

    },
    detail: {
        [theme.breakpoints.down('sm')]: {
            flexDirection: 'column'
        }
    }
})

class SystemContainer extends React.Component {

    constructor(props) {
        super(props)

        const fromStorage = (_app_.localSettings && _app_.localSettings.extensions) || {}

        const extensionStates = {}
        Object.keys(extensions).map(k => {
            extensionStates[k] = fromStorage[k] || {enabled: true}
        })
        this.state = {extensionStates}
    }

    setExtensionState(k, e) {
        e.preventDefault()
        e.stopPropagation()
        this.setState({
            extensionStates: {
                ...this.state.extensionStates,
                [k]: {enabled: !this.state.extensionStates[k].enabled}
            }
        }, () => {
            const ls = Object.assign({}, _app_.localSettings)
            ls.extensions = this.state.extensionStates
            _app_.localSettings = ls
            localStorage.setItem('localSettings', JSON.stringify(ls))
            location.reload()
        })
    }

    render() {
        const {extensionStates} = this.state
        const {classes} = this.props

        return <BaseLayout>
            <Typography variant="h3" component="h1" gutterBottom>System</Typography>
            <Typography variant="h4" component="h2" gutterBottom>Extensions</Typography>
            <Typography variant="subtitle1" gutterBottom>Below are all extensions listed that are currently used with
                this build. You have the option to disable extensions (if supported by the extension) for your session,
                but not for other users. In order to deactivate a extension completely you have to do it in the
                configbuild.</Typography>

            <ContentBlock>
                {
                    Object.keys(extensions).map(k => {
                        const extension = extensions[k]
                        Hook.call('ExtensionSystemInfo', {extension})

                        return <ExpansionPanel className={{detail:classes.detail}} heading={<Typography variant="h6"><SimpleSwitch color="primary"
                                                                                               checked={extensionStates[k].enabled}
                                                                                               onClick={this.setExtensionState.bind(this, k)}
                                                                                               contrast/>{extension.name}
                        </Typography>} key={k}>
                            <div className={classes.column}>
                                <Typography variant="body2" gutterBottom>{extension.description}</Typography>
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
                            <div className={classes.column}>
                                {extension.systemContent}
                            </div>
                        </ExpansionPanel>
                    })
                }
            </ContentBlock>

            <Typography variant="h4" component="h2" gutterBottom>Cache</Typography>

            <Button color="secondary" onClick={e => {
                this.props.client.resetStore().then(() => {
                    console.log('cache cleared')
                })
            } } variant="contained">Clear API cache</Button>

        </BaseLayout>
    }
}


SystemContainer.propTypes = {
    client: PropTypes.instanceOf(ApolloClient).isRequired,
    classes: PropTypes.object.isRequired
}


export default withApollo(withStyles(styles)(SystemContainer))
