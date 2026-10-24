import React from 'react'
import extensions from 'gen/extensions.mjs'
import {Typography, ExpansionPanel, Button, SimpleSwitch, ContentBlock,
    SimpleTab,
    SimpleTabPanel,
    SimpleDialog,
    DeleteIconButton,
    TextField,
    Checkbox,
    FormControlLabel,
    SimpleTabs} from 'ui/admin'
import Hook from 'util/hook.cjs'
import Util from 'client/util/index.mjs'
import {_t} from 'util/i18n.mjs'
import {CAPABILITY_MANAGE_TYPES, CAPABILITY_EXPORT_IMPORT_DATA} from '../../util/capabilities.mjs'
import {loadExportAllSources, exportAllTypeFilesAsZip, pickZipFile, importAllTypeFilesFromZip, formatTypeFilesResult, getExportAiGuide, setExportAiGuide} from '../util/typeFiles'
import {client, Query} from '../middleware/graphql'
import styled from '@emotion/styled'
import SystemUpdatePanel from './SystemUpdatePanel'
import {StyledSystemTable} from './systemStyles'
import {CAPABILITY_RUN_COMMAND} from '../../util/capabilities.mjs'
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
        // the system functions (extensions, database, cache) are for admins, the export / import of
        // the own data is available for every role with the capability (author and up)
        this.isAdmin = Util.hasCapability(_app_.user, CAPABILITY_MANAGE_TYPES)
        this.canExportImport = Util.hasCapability(_app_.user, CAPABILITY_EXPORT_IMPORT_DATA)
        // update the system (git pull, build, restart) - same capability as the shell console
        this.canUpdate = Util.hasCapability(_app_.user, CAPABILITY_RUN_COMMAND)

        this.state = {extensionStates, tabValue: this.isAdmin ? 'extensions' : 'export', message:'', confirmDeletionDialog:false, indexSearch:'',
            exportSources: null, exportBusy: false, importPreview: null, aiGuide: getExportAiGuide()}
    }

    componentDidMount() {
        if (this.canExportImport) {
            loadExportAllSources().then(exportSources => {
                if (!this._unmounted) this.setState({exportSources})
            }).catch(e => {
                if (!this._unmounted) this.setState({exportSources: [], message: e.message})
            })
        }
    }

    componentWillUnmount() {
        this._unmounted = true
    }

    exportAll() {
        this.setState({exportBusy: true})
        exportAllTypeFilesAsZip({aiGuide: this.state.aiGuide}).catch(e => {
            this.setState({message: e.message})
        }).then(() => {
            if (!this._unmounted) this.setState({exportBusy: false})
        })
    }

    // dry run first, the import is only executed after the user has seen what would change
    importAll() {
        pickZipFile().then(file => {
            if (!file) return
            this.setState({exportBusy: true})
            return importAllTypeFilesFromZip(file, {dryRun: true}).then(result => {
                this.setState({importPreview: {file, text: formatTypeFilesResult(result), changes: result.created + result.updated}})
            })
        }).catch(e => {
            this.setState({message: e.message})
        }).then(() => {
            if (!this._unmounted) this.setState({exportBusy: false})
        })
    }

    runImportAll(file) {
        this.setState({importPreview: null, exportBusy: true})
        importAllTypeFilesFromZip(file).then(result => {
            this.setState({message: formatTypeFilesResult(result)})
            client.resetStore()
        }).catch(e => {
            this.setState({message: e.message})
        }).then(() => {
            if (!this._unmounted) this.setState({exportBusy: false})
        })
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
        const {extensionStates, tabValue, message, confirmDeletionDialog, indexSearch, exportSources, exportBusy, importPreview, aiGuide} = this.state
        const {isAdmin, canExportImport, canUpdate} = this

        return <>
            <Typography variant="h3" component="h1" gutterBottom>System</Typography>

            <SimpleTabs
                value={tabValue}
                onChange={(e, newValue) => {
                    this.setState({tabValue:newValue})
                }}
            >
                {isAdmin && <SimpleTab key="extensions" value="extensions" label="Extensions"/>}
                {isAdmin && <SimpleTab key="database" value="database" label="Database / Indexes"/>}
                {isAdmin && <SimpleTab key="cache" value="cache" label="Cache"/>}
                {canUpdate && <SimpleTab key="update" value="update" label={_t('SystemUpdate.tab')}/>}
                {canExportImport && <SimpleTab key="export" value="export" label={_t('SystemContainer.exportImport')}/>}
            </SimpleTabs>

            {isAdmin && <SimpleTabPanel value={tabValue} index="extensions">
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
            </SimpleTabPanel>}
            {isAdmin && <SimpleTabPanel value={tabValue} index="database">

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

                            <StyledSystemTable>
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Key</th>
                                        <th className="num">Size</th>
                                        <th className="num">Ops</th>
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
                                        <td className="mono">{formatIndexKey(parsed)}</td>
                                        <td className="num">{formatBytes(sizeOnDisk)}</td>
                                        <td className="num">{ops === undefined ? '?' : ops}</td>
                                        <td>{opsSince ? new Date(opsSince).toLocaleString() : ''}</td>
                                        <td>{indexFlags(parsed)}</td>
                                        <td>{isDroppable && <DeleteIconButton
                                            onClick={()=>this.setState({confirmDeletionDialog:{name:collection.name,index,open:true}})} />}</td>
                                    </tr>
                                })}</tbody>
                            </StyledSystemTable>
                        </div>)
                    }}
                </Query>

            </SimpleTabPanel>}
            {isAdmin && <SimpleTabPanel value={tabValue} index="cache">
                <Typography variant="h4" component="h2" gutterBottom>Cache</Typography>
                <Button color="secondary" onClick={e => {
                    client.resetStore()
                }} variant="contained">Clear API cache</Button>
            </SimpleTabPanel>}
            {canUpdate && <SimpleTabPanel value={tabValue} index="update">
                <SystemUpdatePanel/>
            </SimpleTabPanel>}
            {canExportImport && <SimpleTabPanel value={tabValue} index="export">
                <Typography variant="h4" component="h2" gutterBottom>{_t('SystemContainer.exportImport')}</Typography>
                <Typography variant="subtitle1" gutterBottom>{_t('SystemContainer.exportImportInfo')}</Typography>

                {exportSources && exportSources.length > 0 && <ul>
                    {exportSources.map(source => <li key={source.type}>{source.type} <code>({source.folder}/)</code></li>)}
                </ul>}

                <FormControlLabel
                    control={<Checkbox checked={aiGuide} onChange={e => {
                        setExportAiGuide(e.target.checked)
                        this.setState({aiGuide: e.target.checked})
                    }}/>}
                    label={_t('SystemContainer.includeAiGuide')}/>
                <Typography variant="caption" component="div" sx={{color: 'text.secondary', ml: 4, mb: 2}}>
                    {_t('SystemContainer.includeAiGuideHint')}
                </Typography>

                <Button color="primary" variant="contained" disabled={exportBusy || !exportSources || exportSources.length === 0}
                        onClick={() => this.exportAll()}>{_t('SystemContainer.exportAll')}</Button>
                {' '}
                <Button color="secondary" variant="contained" disabled={exportBusy || !exportSources || exportSources.length === 0}
                        onClick={() => this.importAll()}>{_t('SystemContainer.importAll')}</Button>
            </SimpleTabPanel>}
            {importPreview && <SimpleDialog open={true} onClose={(e) => {
                if (e.key === 'import') {
                    this.runImportAll(importPreview.file)
                } else {
                    this.setState({importPreview: null})
                }
            }} actions={[
                {key: 'cancel', label: _t('SystemContainer.cancel')},
                ...(importPreview.changes > 0 ? [{key: 'import', label: _t('SystemContainer.importNow'), type: 'primary'}] : [])
            ]} title={_t('SystemContainer.importPreview')}>
                <div style={{whiteSpace: 'pre-wrap'}}>{importPreview.text}</div>
            </SimpleDialog>}
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
