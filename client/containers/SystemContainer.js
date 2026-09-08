import React from 'react'
import extensions from 'gen/extensions.mjs'
import {Typography, ExpansionPanel, Button, SimpleSwitch, ContentBlock,
    SimpleTab,
    SimpleTabPanel,
    SimpleDialog,
    DeleteIconButton,
    TextField,
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


const StyledIndexTable = styled('table')(({theme}) => ({
    borderCollapse: 'collapse',
    width: '100%',
    marginBottom: '1.5rem',
    fontSize: '0.8125rem',
    'th, td': {
        textAlign: 'left',
        padding: '0.25rem 0.5rem',
        borderBottom: '1px solid rgba(0,0,0,0.08)',
        verticalAlign: 'top'
    },
    th: {whiteSpace: 'nowrap', color: theme.palette.text.secondary, fontWeight: 600},
    'td.num': {textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums'},
    'td.key': {fontFamily: 'monospace'},
    // Never used since the counter started - the drop candidates.
    'tr.unused td': {backgroundColor: 'rgba(255,167,38,0.12)'}
}))

const formatBytes = (bytes) => {
    if (!bytes) return '0'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** {public:1, slug:1} -> "public:1, slug:1"; text indexes are shown by their weights. */
const formatIndexKey = (index) => {
    if (index.weights) {
        return `text(${Object.keys(index.weights).join(', ')})`
    }
    return Object.keys(index.key).map(k => `${k}:${index.key[k]}`).join(', ')
}

const indexFlags = (index) =>
    ['unique', 'sparse', 'hidden', 'partialFilterExpression']
        .filter(flag => index[flag])
        .map(flag => flag === 'partialFilterExpression' ? 'partial' : flag)
        .join(', ')

class SystemContainer extends React.Component {

    constructor(props) {
        super(props)

        const fromStorage = (_app_.localSettings && _app_.localSettings.extensions) || {}

        const extensionStates = {}
        Object.keys(extensions).map(k => {
            extensionStates[k] = fromStorage[k] || {enabled: true}
        })
        this.state = {extensionStates, tabValue:0, message:'', confirmDeletionDialog:false, indexSearch:''}
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
        const {extensionStates, tabValue, message, confirmDeletionDialog, indexSearch} = this.state

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


                <TextField fullWidth size="small" sx={{mt: 2}}
                           label="Filter collections and indexes"
                           placeholder="e.g. slug, text, GenericData"
                           value={indexSearch}
                           onChange={e => this.setState({indexSearch: e.target.value})}/>

                <Query key="query" query="query{getAllCollectionIndexes{results{name indexes}}}"
                       fetchPolicy="cache-and-network">
                    {({loading, error, data}) => {
                        if (loading) return 'Loading...'
                        if (error) return `Error! ${error.message}`
                        if (!data.getAllCollectionIndexes.results) return 'No data'
                        const search = indexSearch.trim().toLowerCase()

                        // Biggest index footprint first - that is where dropping
                        // something actually pays off.
                        const collections = [...data.getAllCollectionIndexes.results]
                            .sort((a, b) => (b.totalIndexSize || 0) - (a.totalIndexSize || 0))
                            .map(collection => {
                                if (!search) return collection

                                // A hit on the collection name keeps all of its
                                // indexes, otherwise only the matching ones. The
                                // raw index JSON is searched, so the key fields and
                                // flags are covered too, not just the name.
                                if (collection.name.toLowerCase().includes(search)) return collection

                                const indexes = collection.indexes.filter(
                                    index => index.toLowerCase().includes(search))

                                return indexes.length ? {...collection, indexes} : null
                            })
                            .filter(Boolean)

                        if (!collections.length) return 'No match'

                        return collections.map(collection => <div key={collection.name}>
                            <Typography variant="h6" component="h3" sx={{mt: 2}}>
                                {collection.name}
                                <Typography variant="body2" component="span" sx={{ml: 1, color: 'text.secondary'}}>
                                    {collection.indexes.length} indexes, {formatBytes(collection.totalIndexSize)}
                                </Typography>
                            </Typography>

                            <StyledIndexTable>
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Key</th>
                                        <th style={{textAlign: 'right'}}>Size</th>
                                        <th style={{textAlign: 'right'}}>Ops</th>
                                        <th>Counting since</th>
                                        <th>Flags</th>
                                        <th/>
                                    </tr>
                                </thead>
                                <tbody>{collection.indexes.map(index => {
                                    const parsed = JSON.parse(index)
                                    const {name, sizeOnDisk, ops, opsSince} = parsed

                                    // _id_ is mandatory and cannot be dropped, so it is
                                    // never a candidate no matter how often it is used.
                                    const isDroppable = name !== '_id_'

                                    return <tr key={name} className={isDroppable && ops === 0 ? 'unused' : ''}>
                                        <td>{name}</td>
                                        <td className="key">{formatIndexKey(parsed)}</td>
                                        <td className="num">{formatBytes(sizeOnDisk)}</td>
                                        <td className="num">{ops === undefined ? '?' : ops}</td>
                                        <td>{opsSince ? new Date(opsSince).toLocaleString() : ''}</td>
                                        <td>{indexFlags(parsed)}</td>
                                        <td>{isDroppable && <DeleteIconButton
                                            onClick={()=>this.setState({confirmDeletionDialog:{name:collection.name,index,open:true}})} />}</td>
                                    </tr>
                                })}</tbody>
                            </StyledIndexTable>
                        </div>)
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

            {confirmDeletionDialog &&
                <SimpleDialog open={confirmDeletionDialog.open} onClose={(e)=>{
                    if(e.key==='yes') {
                        this.deleteIndex(confirmDeletionDialog.name, confirmDeletionDialog.index)
                    }
                    this.setState({confirmDeletionDialog: {open:false}})
                }}
                              actions={[{key: 'yes', label: 'Yes'}, {key: 'no', label: 'No', type: 'primary'}]}
                              title="Confirm deletion">
                    Are you sure you want to delete the index &ldquo;{JSON.parse(confirmDeletionDialog.index).name}&rdquo; on {confirmDeletionDialog.name}?
                </SimpleDialog>
            }
        </>
    }

    deleteIndex(name, index){
        const indexJson = JSON.parse(index)

        client.mutate({
                mutation: `mutation dropDbIndexes($name:String!,$indexes:[String]!){dropDbIndexes(name:$name,indexes:$indexes){status}}`,
                variables: {name, indexes:[indexJson.name]},
                update: (store, {data: {dropDbIndexes}}) => {
                    this.forceUpdate()
                }
            }
        )

    }
}

export default SystemContainer
