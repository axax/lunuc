import React from 'react'
import extensions from 'gen/extensions.mjs'
import {Typography, ExpansionPanel, Button, SimpleSwitch, ContentBlock,
    SimpleTab,
    SimpleTabPanel,
    SimpleDialog,
    SimpleTabs} from 'ui/admin'
import Hook from 'util/hook.cjs'
import {client, Query} from '../middleware/graphql'
import styled from '@emotion/styled'
const StyledColumn = styled('div')({
    flexBasis: '50%'
})
const StyledExpansionPanel = styled(ExpansionPanel)(({theme}) => ({
    '.MuiAccordionDetails-root': {
        display: 'flex',
        [theme.breakpoints.down('sm')]: {
            flexDirection: 'column'
        }
    }
}))


class SystemContainer extends React.Component {

    constructor(props) {
        super(props)

        const fromStorage = (_app_.localSettings && _app_.localSettings.extensions) || {}

        const extensionStates = {}
        Object.keys(extensions).map(k => {
            extensionStates[k] = fromStorage[k] || {enabled: true}
        })
        this.state = {extensionStates, tabValue:0, message:''}
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
        const {extensionStates, tabValue, message} = this.state

        return <>
            <Typography variant="h3" component="h1" gutterBottom>System</Typography>

            <SimpleTabs
                value={tabValue}
                onChange={(e, newValue) => {
                    this.setState({tabValue:newValue})
                }}
            >
                <SimpleTab key="extensions" label="Extensions"/>
                <SimpleTab key="database" label="Database / Indexes"/>
                <SimpleTab key="cache" label="Cache"/>
            </SimpleTabs>

            <SimpleTabPanel value={tabValue} index={0}>
                <Typography variant="h4" component="h2" gutterBottom>Extensions</Typography>
                <Typography variant="subtitle1" gutterBottom>Below are all extensions listed that are currently used
                    with
                    this build. You have the option to disable extensions (if supported by the extension) for your
                    session,
                    but not for other users. In order to deactivate a extension completely you have to do it in the
                    configbuild.</Typography>

                <ContentBlock>
                    {
                        Object.keys(extensions).map(k => {
                            const extension = extensions[k]
                            Hook.call('ExtensionSystemInfo', {extension})

                            return <StyledExpansionPanel heading={<Typography variant="h6">
                                <SimpleSwitch color="primary"
                                              checked={extensionStates[k].enabled}
                                              onClick={this.setExtensionState.bind(this, k)}
                                />{extension.name}
                            </Typography>} key={k}>
                                <StyledColumn>
                                    <Typography variant="body2" gutterBottom>{extension.description}</Typography>
                                    {extension.options && extension.options.types &&
                                        <ul>
                                            {extension.options.types.map(type => {
                                                return <li key={type.name}>{type.name} {type.fields && type.fields.length &&
                                                    <ul>{type.fields.map(field => {
                                                        return <li key={field.name}>{field.name}</li>
                                                    })}</ul>}</li>
                                            })}
                                        </ul>
                                    }
                                </StyledColumn>
                                <StyledColumn>
                                    {extension.systemContent}
                                </StyledColumn>
                            </StyledExpansionPanel>
                        })
                    }
                </ContentBlock>
            </SimpleTabPanel>
            <SimpleTabPanel value={tabValue} index={1}>

                <Typography variant="h4" component="h2" gutterBottom>Database</Typography>

                <Query key="query" query="query{systemInfo{dbUrl}}"
                       fetchPolicy="cache-and-network">
                    {({loading, error, data}) => {
                        if (loading) return 'Loading...'
                        if (error) return `Error! ${error.message}`
                        return <dl>
                            <dt>Database URL:</dt>
                            <dd>{data.systemInfo.dbUrl}</dd>
                        </dl>

                    }}
                </Query>


                <Typography variant="h4" component="h2" gutterBottom sx={{mt:2}}>Indexes</Typography>

                <Button color="secondary" onClick={e => {
                    client.mutate({
                            mutation: `mutation createDbIndexes{createDbIndexes{status}}`,
                            update: (store, {data: {createDbIndexes}}) => {
                                this.setState({message:createDbIndexes.status})
                            }
                        }
                    )
                }} variant="contained">Create DB Indexes</Button>


                <Query key="query" query="query{getAllCollectionIndexes{results{name indexes}}}"
                       fetchPolicy="cache-and-network">
                    {({loading, error, data}) => {
                        if (loading) return 'Loading...'
                        if (error) return `Error! ${error.message}`
                        if (!data.getAllCollectionIndexes.results) return 'No data'
                        return <ul>{data.getAllCollectionIndexes.results.map(collection=><li>{collection.name}<ul>{
                            collection.indexes.map(index=><li>{index}</li>)
                        }</ul></li>)}</ul>
                    }}
                </Query>

            </SimpleTabPanel>
            <SimpleTabPanel value={tabValue} index={2}>
                <Typography variant="h4" component="h2" gutterBottom>Cache</Typography>
                <Button color="secondary" onClick={e => {
                    client.resetStore()
                }} variant="contained">Clear API cache</Button>
            </SimpleTabPanel>
            {message && <SimpleDialog open={true} onClose={()=>{
                this.setState({message:''})
            }} actions={[{autoFocus: true, key: 'ok', label: 'Ok', type: 'primary'}]} title="Response">
                {message}
            </SimpleDialog>}
        </>
    }
}

export default SystemContainer
