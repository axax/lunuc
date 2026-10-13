import React from 'react'
import PropTypes from 'prop-types'
import compose from 'util/compose'
import Util from 'client/util/index.mjs'
import {
    Row,
    Col,
    Typography,
    SimpleList,
    SimpleDialog,
    DeleteIconButton,
    ContentCopyIconButton,
    TextField,
    MenuItem,
    Button,
    ButtonGroup,
    Menu,
    Snackbar,
    Tooltip,
    Paper,
    InputAdornment,
    SearchIcon
} from 'ui/admin'
import config from 'gen/config-client'
import {graphql} from '../../../client/middleware/graphql'
import Async from 'client/components/Async'
import {_t} from 'util/i18n.mjs'

const {ADMIN_BASE_URL} = config

const DEFAULT_RESULT_LIMIT = 25
const SAVE_DELAY = 1200
const WORDS_PER_MINUTE = 200

const SORT_OPTIONS = {
    new: {sort: '_id desc', label: 'Post.sortNewest'},
    mod: {sort: 'modifiedAt desc', label: 'Post.sortModified'},
    old: {sort: '_id asc', label: 'Post.sortOldest'},
    title: {sort: 'title asc', label: 'Post.sortTitle'}
}

const PostEditor = (props) => <Async {...props}
                                     load={() => import(/* webpackChunkName: "post" */ '../components/PostEditor')}/>

/**
 * Liefert den reinen Text eines Lexical-JSON-Bodys (für Vorschau-Snippets in der Liste)
 */
const lexicalPlainText = (body, maxLength = 90) => {
    if (!body) {
        return ''
    }
    let json
    try {
        json = body.constructor === String ? JSON.parse(body) : body
    } catch (e) {
        return ''
    }
    let text = ''
    const walk = (node) => {
        if (!node || text.length > maxLength) {
            return
        }
        if (node.text) {
            text += node.text
        }
        if (node.children) {
            node.children.forEach(walk)
            if (node.type !== 'root' && node.type !== 'text') {
                text += ' '
            }
        }
    }
    walk(json.root)
    text = text.replace(/\s+/g, ' ').trim()
    return text.length > maxLength ? text.substring(0, maxLength) + '…' : text
}

const slugify = (str) => (str || 'post').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'post'

const toAbsoluteUrls = (str) => {
    const origin = window.location.origin
    return str.replace(/(src|href)="\/(?!\/)/g, `$1="${origin}/`).replace(/\]\(\/(?!\/)/g, `](${origin}/`)
}

const downloadFile = (content, fileName, mimeType) => {
    const blob = new Blob([content], {type: mimeType + ';charset=utf-8'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const SAVE_STATES = {
    dirty: {label: 'Post.unsaved', color: '#f59e0b'},
    saving: {label: 'Post.saving', color: '#3b82f6'},
    saved: {label: 'Post.saved', color: '#16a34a'},
    error: {label: 'Post.saveError', color: '#dc2626'}
}

// Pagination in der schmalen Spalte kompakt umbrechen statt horizontal zu scrollen
const paginationSx = {
    '& .MuiTablePagination-root': {
        overflow: 'hidden'
    },
    '& .MuiTablePagination-toolbar': {
        flexWrap: 'wrap',
        justifyContent: 'flex-end',
        paddingLeft: 0,
        paddingRight: 0,
        minHeight: 'auto',
        gap: '0 4px'
    },
    '& .MuiTablePagination-spacer': {
        display: 'none'
    },
    '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': {
        fontSize: '0.8rem',
        margin: '8px 0'
    },
    '& .MuiTablePagination-input': {
        marginLeft: '4px',
        marginRight: '8px'
    },
    '& .MuiTablePagination-actions': {
        marginLeft: '4px'
    }
}

// Segmentierte Umschaltung ohne Abstand zwischen den Buttons
const segmentedSx = {
    gap: 0,
    '& .MuiButton-root': {
        margin: 0,
        boxShadow: 'none',
        backgroundImage: 'none'
    },
    '& .MuiButton-root.active': {
        backgroundColor: 'primary.main',
        borderColor: 'primary.main',
        color: 'primary.contrastText'
    },
    '& .MuiButton-root.active:hover': {
        backgroundColor: 'primary.dark'
    }
}

const styles = {
    panel: {
        padding: '16px',
        borderRadius: '12px'
    },
    editorPanel: {
        padding: '20px 24px',
        borderRadius: '12px',
        display: 'flex',
        flexDirection: 'column'
    },
    fullscreen: {
        position: 'fixed',
        inset: 0,
        zIndex: 1250,
        background: '#f7f7f8',
        display: 'flex',
        justifyContent: 'center',
        overflow: 'hidden'
    },
    fullscreenInner: {
        width: '100%',
        maxWidth: '1040px',
        height: '100%',
        boxSizing: 'border-box',
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0
    },
    row: {
        display: 'flex',
        gap: '8px',
        alignItems: 'center'
    },
    header: {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '8px 12px'
    },
    actions: {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '8px',
        marginLeft: 'auto'
    },
    meta: {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '4px 0',
        color: '#6b7280',
        fontSize: '0.8rem',
        margin: '4px 0 16px 0'
    },
    metaSep: {
        margin: '0 8px',
        color: '#d1d5db'
    },
    status: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        border: 0,
        background: 'none',
        padding: 0,
        font: 'inherit',
        color: 'inherit'
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: '50%',
        display: 'inline-block'
    },
    titleInput: {
        fontSize: '1.75rem',
        fontWeight: 600,
        lineHeight: 1.3
    },
    snippet: {
        display: 'block',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        color: '#6b7280'
    },
    date: {
        display: 'block',
        fontSize: '0.72rem',
        color: '#9ca3af'
    },
    empty: {
        padding: '64px 24px',
        textAlign: 'center',
        color: '#888',
        borderRadius: '12px'
    }
}

class PostContainer extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            confirmDeletionDialog: false,
            dataToDelete: null,
            saveState: {},
            stats: null,
            fullscreen: false,
            mode: 'edit',
            previewHtml: '',
            exportAnchor: null,
            message: null,
            newTitle: ''
        }

        const params = Util.extractQueryParams(window.location.search.substring(1))
        this.filter = params.f
        this.sortKey = SORT_OPTIONS[params.s] ? params.s : 'new'

        // noch nicht gespeicherte Inhalte pro Post-ID
        this.pendingBodies = {}
        this.saveTimeouts = {}
        this.lastSavedBodies = {}
        this.editorApi = null
        this.importInputRef = React.createRef()
    }

    componentDidMount() {
        window.addEventListener('beforeunload', this.handleBeforeUnload)
        document.addEventListener('keydown', this.handleKeyDown)
    }

    componentWillUnmount() {
        window.removeEventListener('beforeunload', this.handleBeforeUnload)
        document.removeEventListener('keydown', this.handleKeyDown)
        document.body.style.overflow = ''
        // beim Verlassen der Seite alles Ausstehende sofort speichern
        Object.keys(this.pendingBodies).forEach(id => this.flushSave(id))
    }

    componentDidUpdate(prevProps, prevState) {
        if (prevState.fullscreen !== this.state.fullscreen) {
            // Seite hinter dem Vollbild nicht mitscrollen
            document.body.style.overflow = this.state.fullscreen ? 'hidden' : ''
            if (this.editorApi) {
                setTimeout(() => this.editorApi && this.editorApi.focus(), 0)
            }
        }
        const prevId = prevProps.match.params.id, currentId = this.props.match.params.id
        if (prevId !== currentId) {
            if (prevId) {
                this.flushSave(prevId)
            }
            this.editorApi = null
            this.setState({stats: null, mode: 'edit', previewHtml: ''})
        }
    }

    handleBeforeUnload = (e) => {
        if (Object.keys(this.pendingBodies).length > 0) {
            e.preventDefault()
            e.returnValue = _t('Post.unsavedLeave')
            return e.returnValue
        }
    }

    handleKeyDown = (e) => {
        const selectedId = this.props.match.params.id
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && selectedId) {
            e.preventDefault()
            this.flushSave(selectedId)
        } else if (e.key === 'Escape' && this.state.fullscreen) {
            this.setState({fullscreen: false})
        }
    }

    setSaveState(postId, value) {
        this.setState(state => ({saveState: {...state.saveState, [postId]: value}}))
    }

    showMessage(message) {
        this.setState({message})
    }

    /* ---------------- Speichern ---------------- */

    handleBodyChange = (postId, data) => {
        const body = data.constructor === String ? data : JSON.stringify(data)
        if (this.lastSavedBodies[postId] === body) {
            return
        }
        this.pendingBodies[postId] = body
        if (this.state.saveState[postId] !== 'dirty') {
            this.setSaveState(postId, 'dirty')
        }
        clearTimeout(this.saveTimeouts[postId])
        this.saveTimeouts[postId] = setTimeout(() => this.flushSave(postId), SAVE_DELAY)
    }

    flushSave(postId) {
        clearTimeout(this.saveTimeouts[postId])
        const body = this.pendingBodies[postId]
        if (body === undefined) {
            return
        }
        delete this.pendingBodies[postId]
        this.setSaveState(postId, 'saving')

        this.props.updatePost({_id: postId, body}).then(() => {
            this.lastSavedBodies[postId] = body
            this.setSaveState(postId, this.pendingBodies[postId] !== undefined ? 'dirty' : 'saved')
        }).catch(error => {
            console.error(error)
            // Inhalt wieder als ausstehend markieren, damit nichts verloren geht
            if (this.pendingBodies[postId] === undefined) {
                this.pendingBodies[postId] = body
            }
            this.setSaveState(postId, 'error')
        })
    }

    handleTitleBlur = (post, e) => {
        const title = e.target.value.trim()
        if (title && title !== post.title) {
            this.props.updatePost({_id: post._id, title})
        } else if (!title) {
            e.target.value = post.title
        }
    }

    /* ---------------- Anlegen / Duplizieren / Löschen ---------------- */

    handleCreate = () => {
        const title = this.state.newTitle.trim() || _t('Post.untitled')
        this.createAndOpen({title})
        this.setState({newTitle: ''})
    }

    handleDuplicate = (post, e) => {
        e.stopPropagation()
        const body = this.pendingBodies[post._id] || post.body
        this.createAndOpen({title: `${post.title} ${_t('Post.copySuffix')}`, body, editor: post.editor})
    }

    createAndOpen(post) {
        this.props.createPost({body: '', editor: 'lexical', ...post}).then(({data}) => {
            if (data && data.createPost && data.createPost._id) {
                this.goTo(data.createPost._id)
            }
        }).catch(error => this.showMessage(error.message))
    }

    handlePostDeleteClick = (post, e) => {
        e.stopPropagation()
        this.setState({confirmDeletionDialog: true, dataToDelete: post})
    }

    handleConfirmDeletion = (action) => {
        const {dataToDelete} = this.state
        if (action && action.key === 'yes' && dataToDelete) {
            const {_id} = dataToDelete
            clearTimeout(this.saveTimeouts[_id])
            delete this.pendingBodies[_id]
            this.props.deletePost({_id})
            if (this.props.match.params.id === _id) {
                this.goTo(null)
            }
        }
        this.setState({confirmDeletionDialog: false, dataToDelete: null})
    }

    /* ---------------- Navigation ---------------- */

    handleChangePage = (page) => {
        this.goTo(this.props.match.params.id, page, this.props.posts.limit)
    }

    handleChangeRowsPerPage = (limit) => {
        this.goTo(this.props.match.params.id, 1, limit)
    }

    handleFilterChange = (e) => {
        this.filter = e.target.value
        clearTimeout(this.filterTimeout)
        this.filterTimeout = setTimeout(() => {
            this.goTo(this.props.match.params.id, 1)
        }, 300)
    }

    handleSortChange = (e) => {
        this.sortKey = e.target.value
        this.goTo(this.props.match.params.id, 1)
    }

    goTo(id, page, limit) {
        const {posts} = this.props
        const finalLimit = limit || (posts && posts.limit) || DEFAULT_RESULT_LIMIT
        const finalPage = page || (posts && posts.limit ? 1 + Math.floor(posts.offset / posts.limit) : 1)
        let query = `p=${finalPage}&l=${finalLimit}`
        if (this.filter) {
            query += '&f=' + encodeURIComponent(this.filter)
        }
        if (this.sortKey && this.sortKey !== 'new') {
            query += '&s=' + this.sortKey
        }
        this.props.history.push(`${ADMIN_BASE_URL}/post${id ? '/' + id : ''}?${query}`)
    }

    /* ---------------- Editor-API: Vorschau / Export / Import ---------------- */

    handleEditorReady = (api) => {
        this.editorApi = api
    }

    handleStats = (stats) => {
        this.setState({stats})
    }

    handleImageError = (error) => {
        this.showMessage(_t('Post.imageUploadError', {message: error.message}))
    }

    setMode(mode) {
        if (mode === 'preview' && this.editorApi) {
            this.setState({mode, previewHtml: this.editorApi.exportHtml()})
        } else {
            this.setState({mode: 'edit'})
            if (this.editorApi) {
                setTimeout(() => this.editorApi && this.editorApi.focus(), 0)
            }
        }
    }

    handleExport(type, post) {
        this.setState({exportAnchor: null})
        const api = this.editorApi
        if (!api) {
            return
        }
        const fileBase = slugify(post.title)
        if (type === 'html' || type === 'copyHtml') {
            const html = toAbsoluteUrls(api.exportHtml())
            if (type === 'copyHtml') {
                this.copyToClipboard(html)
            } else {
                const title = (post.title || '').replace(/</g, '&lt;')
                downloadFile(`<!DOCTYPE html>
<html lang="${_app_.lang || 'de'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:780px;margin:40px auto;padding:0 20px;line-height:1.6;color:#111}
img{max-width:100%;height:auto}figure{margin:16px 0}figcaption{font-size:13px;color:#666;text-align:center}
.align-center{margin-left:auto;margin-right:auto}.align-right{margin-left:auto}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:6px 8px;text-align:left}th{background:#f2f3f5}
blockquote{margin:0 0 0 20px;padding-left:16px;border-left:4px solid #ccc;color:#555}
pre,code{background:#f0f2f5;font-family:Menlo,Consolas,monospace}pre{padding:8px;overflow:auto}
</style>
</head>
<body>
<h1>${title}</h1>
${html}
</body>
</html>`, `${fileBase}.html`, 'text/html')
            }
        } else if (type === 'md' || type === 'copyMd') {
            const md = toAbsoluteUrls(api.exportMarkdown())
            if (type === 'copyMd') {
                this.copyToClipboard(md)
            } else {
                downloadFile(`# ${post.title}\n\n${md}\n`, `${fileBase}.md`, 'text/markdown')
            }
        } else if (type === 'importMd') {
            if (this.importInputRef.current) {
                this.importInputRef.current.click()
            }
        }
    }

    copyToClipboard(text) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => this.showMessage(_t('Post.copied')))
                .catch(e => this.showMessage(e.message))
        }
    }

    handleImportFile = (e) => {
        const file = e.target.files && e.target.files[0]
        e.target.value = ''
        if (!file || !this.editorApi) {
            return
        }
        const reader = new FileReader()
        reader.onload = () => {
            if (window.confirm(_t('Post.importConfirm'))) {
                // eine führende H1 entspricht meist dem Titel -> entfernen
                const md = String(reader.result).replace(/^\s*#\s+[^\n]*\n/, '')
                this.editorApi.importMarkdown(md)
                this.setMode('edit')
            }
        }
        reader.readAsText(file)
    }

    /* ---------------- Rendering ---------------- */

    renderList(selectedPostId) {
        const {posts} = this.props
        const items = (posts.results || []).map(post => {
            const snippet = lexicalPlainText(this.pendingBodies[post._id] || post.body)
            return {
                selected: post._id === selectedPostId,
                primary: post.title || _t('Post.untitled'),
                secondary: <>
                    {snippet && <span style={styles.snippet}>{snippet}</span>}
                    <span style={styles.date}>{Util.formattedDatetimeFromObjectId(post._id)}</span>
                </>,
                onClick: () => {
                    if (post._id !== selectedPostId) {
                        this.goTo(post._id)
                    }
                },
                actions: <span style={{display: 'flex'}}>
                    <Tooltip title={_t('Post.duplicate')}>
                        <ContentCopyIconButton size="small" onClick={this.handleDuplicate.bind(this, post)}/>
                    </Tooltip>
                    <Tooltip title={_t('Post.delete')}>
                        <DeleteIconButton size="small" onClick={this.handlePostDeleteClick.bind(this, post)}/>
                    </Tooltip>
                </span>,
                disabled: ['creating', 'deleting'].indexOf(post.status) > -1,
                style: {paddingRight: 84}
            }
        })

        return <Paper variant="outlined" style={styles.panel}>
            <div style={{...styles.row, marginBottom: '12px'}}>
                <TextField size="small"
                           fullWidth
                           style={{minWidth: 0}}
                           placeholder={_t('Post.enterTitle')}
                           value={this.state.newTitle}
                           onChange={e => this.setState({newTitle: e.target.value})}
                           onKeyDown={e => {
                               if (e.key === 'Enter') {
                                   e.preventDefault()
                                   this.handleCreate()
                               }
                           }}/>
                <Button variant="contained" disableElevation onClick={this.handleCreate}
                        style={{whiteSpace: 'nowrap', height: 40, flexShrink: 0, margin: 0}}>{_t('Post.create')}</Button>
            </div>

            <TextField size="small"
                       fullWidth
                       placeholder={_t('Post.search')}
                       defaultValue={this.filter}
                       onChange={this.handleFilterChange}
                       style={{marginBottom: '8px'}}
                       slotProps={{
                           input: {
                               startAdornment: <InputAdornment position="start">
                                   <SearchIcon fontSize="small" style={{color: '#9ca3af'}}/>
                               </InputAdornment>
                           }
                       }}/>
            <TextField select
                       size="small"
                       fullWidth
                       value={this.sortKey}
                       onChange={this.handleSortChange}
                       style={{marginBottom: '8px'}}>
                {Object.keys(SORT_OPTIONS).map(key =>
                    <MenuItem key={key} value={key}>{_t(SORT_OPTIONS[key].label)}</MenuItem>)}
            </TextField>

            <SimpleList items={items}
                        paperProps={{elevation: 0, sx: paginationSx}}
                        sx={{padding: 0}}
                        rowsPerPage={posts.limit}
                        onChangePage={this.handleChangePage}
                        onChangeRowsPerPage={this.handleChangeRowsPerPage}
                        count={posts.total}
                        page={posts.offset / posts.limit + 1}/>
        </Paper>
    }

    renderEditor(post) {
        const {saveState, stats, fullscreen, mode, previewHtml, exportAnchor} = this.state
        const state = saveState[post._id] || 'saved'
        const status = SAVE_STATES[state]
        const readingTime = stats ? Math.max(1, Math.round(stats.words / WORDS_PER_MINUTE)) : 0
        const sep = <span style={styles.metaSep}>·</span>

        const content = <>
            <div style={styles.header}>
                <TextField key={post._id}
                           variant="standard"
                           defaultValue={post.title}
                           placeholder={_t('Post.untitled')}
                           style={{flex: '1 1 280px', minWidth: 0}}
                           slotProps={{input: {disableUnderline: true, style: styles.titleInput}}}
                           onBlur={this.handleTitleBlur.bind(this, post)}
                           onKeyDown={e => {
                               if (e.key === 'Enter') {
                                   e.preventDefault()
                                   e.target.blur()
                                   this.editorApi && this.editorApi.focus()
                               }
                           }}/>

                <div style={styles.actions}>
                    <ButtonGroup size="small" variant="outlined" disableElevation sx={segmentedSx}>
                        <Button className={mode === 'edit' ? 'active' : ''}
                                onClick={() => this.setMode('edit')}>{_t('Post.edit')}</Button>
                        <Button className={mode === 'preview' ? 'active' : ''}
                                onClick={() => this.setMode('preview')}>{_t('Post.preview')}</Button>
                    </ButtonGroup>

                    <Button size="small" variant="outlined"
                            onClick={e => this.setState({exportAnchor: e.currentTarget})}>{_t('Post.export')} ▾</Button>
                    <Menu anchorEl={exportAnchor} open={!!exportAnchor}
                          onClose={() => this.setState({exportAnchor: null})}>
                        <MenuItem onClick={() => this.handleExport('html', post)}>{_t('Post.exportHtml')}</MenuItem>
                        <MenuItem onClick={() => this.handleExport('md', post)}>{_t('Post.exportMarkdown')}</MenuItem>
                        <MenuItem onClick={() => this.handleExport('copyHtml', post)}>{_t('Post.copyHtml')}</MenuItem>
                        <MenuItem onClick={() => this.handleExport('copyMd', post)}>{_t('Post.copyMarkdown')}</MenuItem>
                        <MenuItem onClick={() => this.handleExport('importMd', post)}>{_t('Post.importMarkdown')}</MenuItem>
                    </Menu>
                    <input ref={this.importInputRef} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain"
                           style={{display: 'none'}} onChange={this.handleImportFile}/>

                    <Button size="small" variant="outlined"
                            onClick={() => this.setState({fullscreen: !fullscreen})}>
                        {fullscreen ? _t('Post.exitFullscreen') : _t('Post.fullscreen')}
                    </Button>
                </div>
            </div>

            <div style={styles.meta}>
                <Tooltip title={state !== 'saved' ? _t('Post.saveNow') + ' (Ctrl+S)' : ''}>
                    <button type="button"
                            style={{...styles.status, cursor: state !== 'saved' ? 'pointer' : 'default'}}
                            onClick={state !== 'saved' ? () => this.flushSave(post._id) : undefined}>
                        <span style={{...styles.dot, background: status.color}}/>
                        <span style={{color: state === 'error' ? status.color : undefined}}>{_t(status.label)}</span>
                    </button>
                </Tooltip>
                {stats && <>
                    {sep}{_t('Post.words', {count: stats.words})}
                    {sep}{_t('Post.readingTime', {min: readingTime})}
                </>}
                {sep}
                <Tooltip title={'ID: ' + post._id}>
                    <span>{_t('Post.created')} {Util.formattedDatetimeFromObjectId(post._id)}</span>
                </Tooltip>
                {post.modifiedAt ? <>{sep}{_t('Post.modified')} {new Date(post.modifiedAt).toLocaleString()}</> : null}
            </div>

            {mode === 'preview' &&
            <div className="editor-container read-only post-preview"
                 style={{flex: fullscreen ? 1 : undefined, minHeight: 0, overflow: 'auto'}}>
                <div className="editor-input"
                     dangerouslySetInnerHTML={{__html: previewHtml}}/>
            </div>}

            <div style={{
                display: mode === 'edit' ? 'flex' : 'none',
                flexDirection: 'column',
                flex: fullscreen ? 1 : undefined,
                minHeight: 0
            }}>
                {post.editor === 'lexical' || !post.editor ?
                    <PostEditor post={post}
                                onChange={this.handleBodyChange.bind(this, post._id)}
                                onReady={this.handleEditorReady}
                                onStats={this.handleStats}
                                onImageError={this.handleImageError}/> :
                    <Typography color="error">Unsupported editor: {post.editor}</Typography>}
            </div>
        </>

        if (fullscreen) {
            return <div style={styles.fullscreen} className="post-fullscreen">
                <div style={styles.fullscreenInner}>{content}</div>
            </div>
        }
        return <Paper variant="outlined" style={styles.editorPanel}>{content}</Paper>
    }

    render() {
        const {posts, match} = this.props

        if (!posts) {
            return null
        }

        const selectedPostId = match.params.id
        const selectedPost = (posts.results || []).find(post => post._id === selectedPostId)

        return <>
            <Typography variant="h3" gutterBottom>{_t('Post.posts')}</Typography>
            <Row spacing={3}>
                <Col xs={12} md={4} xl={3}>
                    {this.renderList(selectedPostId)}
                </Col>
                <Col xs={12} md={8} xl={9}>
                    {selectedPost ?
                        this.renderEditor(selectedPost) :
                        <Paper variant="outlined" style={styles.empty}>{_t('Post.noSelection')}</Paper>}
                </Col>
            </Row>

            {this.state.dataToDelete &&
            <SimpleDialog open={this.state.confirmDeletionDialog} onClose={this.handleConfirmDeletion}
                          actions={[{key: 'yes', label: _t('Post.yes')}, {
                              key: 'no',
                              label: _t('Post.no'),
                              type: 'primary'
                          }]}
                          title={_t('Post.confirmDeletion')}>
                {_t('Post.confirmDeletionText', {title: this.state.dataToDelete.title})}
            </SimpleDialog>}

            <Snackbar open={!!this.state.message}
                      autoHideDuration={4000}
                      anchorOrigin={{vertical: 'bottom', horizontal: 'left'}}
                      onClose={() => this.setState({message: null})}
                      message={this.state.message || ''}/>
        </>
    }
}


PostContainer.propTypes = {
    /* routing params */
    match: PropTypes.object,
    history: PropTypes.object.isRequired,
    loading: PropTypes.bool,
    posts: PropTypes.object,
    createPost: PropTypes.func.isRequired,
    updatePost: PropTypes.func.isRequired,
    deletePost: PropTypes.func.isRequired
}


const getVariables = () => {
    const {p, l, f, s} = Util.extractQueryParams(window.location.search.substring(1))
    const sortOption = SORT_OPTIONS[s] || SORT_OPTIONS.new
    return {
        limit: l ? parseInt(l) : DEFAULT_RESULT_LIMIT,
        page: p ? parseInt(p) : 1,
        query: f || '',
        sort: sortOption.sort
    }
}

// nur gesetzte Felder übernehmen (der Server liefert nicht übergebene Felder als null)
const definedFields = (obj) => {
    const result = {}
    Object.keys(obj).forEach(key => {
        if (obj[key] !== undefined && obj[key] !== null) {
            result[key] = obj[key]
        }
    })
    return result
}

const POST_FIELDS = '_id title body editor status modifiedAt createdBy{_id username}'

const gqlQuery = `query posts($limit: Int, $page: Int, $query: String, $sort: String){posts(limit: $limit, page: $page, query: $query, sort: $sort){limit offset total results{${POST_FIELDS}}}}`

const PostContainerWithGql = compose(
    graphql(gqlQuery, {
        options() {
            return {
                fetchPolicy: 'cache-and-network',
                variables: getVariables()
            }
        },
        props: ({data: {loading, posts}}) => ({
            posts,
            loading
        })
    }),
    graphql(`mutation createPost($title: String!, $body: String, $editor: String){createPost(title:$title,body:$body,editor:$editor){${POST_FIELDS}}}`, {
        props: ({mutate}) => ({
            createPost: ({title, body, editor}) => {
                return mutate({
                    variables: {title, body, editor},
                    optimisticResponse: {
                        __typename: 'Mutation',
                        createPost: {
                            _id: '#' + new Date().getTime(),
                            body,
                            title,
                            editor,
                            modifiedAt: Date.now(),
                            status: 'creating',
                            createdBy: {
                                _id: _app_.user._id,
                                username: _app_.user.username,
                                __typename: 'UserPublic'
                            },
                            __typename: 'Post'
                        }
                    },
                    update: (store, {data}) => {
                        if (!data || !data.createPost) {
                            return
                        }
                        const variables = getVariables()
                        const storeData = store.readQuery({query: gqlQuery, variables})
                        if (!storeData || !storeData.posts) {
                            return
                        }
                        const newData = {...storeData.posts}
                        newData.results = newData.results ? [...newData.results] : []
                        // neue Posts oben anzeigen
                        newData.results.unshift(data.createPost)
                        newData.total = (newData.total || 0) + 1
                        store.writeQuery({query: gqlQuery, variables, data: {...storeData, posts: newData}})
                    }
                })
            }
        })
    }),
    graphql(`mutation updatePost($_id: ID!,$body: String, $title: String, $editor: String){updatePost(_id:$_id,body:$body,title:$title,editor:$editor){${POST_FIELDS}}}`, {
        props: ({mutate}) => ({
            // es werden nur die übergebenen Felder geändert
            updatePost: ({_id, body, editor, title}) => {
                const changes = definedFields({body, editor, title})
                return mutate({
                    variables: {_id, ...changes},
                    optimisticResponse: {
                        __typename: 'Mutation',
                        updatePost: {
                            _id,
                            ...changes,
                            modifiedAt: Date.now(),
                            status: 'updating',
                            __typename: 'Post'
                        }
                    },
                    update: (store, {data}) => {
                        if (!data || !data.updatePost) {
                            return
                        }
                        const variables = getVariables()
                        const storeData = store.readQuery({query: gqlQuery, variables})
                        if (!storeData || !storeData.posts || !storeData.posts.results) {
                            return
                        }
                        const idx = storeData.posts.results.findIndex(x => x._id === data.updatePost._id)
                        if (idx > -1) {
                            const newData = {...storeData.posts, results: [...storeData.posts.results]}
                            newData.results[idx] = {...newData.results[idx], ...definedFields(data.updatePost)}
                            store.writeQuery({query: gqlQuery, variables, data: {...storeData, posts: newData}})
                        }
                    }
                })
            }
        })
    }),
    graphql(`mutation deletePost($_id: ID!){deletePost(_id: $_id){_id status}}`, {
        props: ({mutate}) => ({
            deletePost: ({_id}) => {
                return mutate({
                    variables: {_id},
                    optimisticResponse: {
                        __typename: 'Mutation',
                        deletePost: {
                            _id: _id,
                            status: 'deleting',
                            __typename: 'Post'
                        }
                    },
                    update: (store, {data}) => {
                        if (!data || !data.deletePost) {
                            return
                        }
                        const {deletePost} = data
                        const variables = getVariables()
                        const storeData = store.readQuery({query: gqlQuery, variables})
                        if (!storeData || !storeData.posts || !storeData.posts.results) {
                            return
                        }
                        const idx = storeData.posts.results.findIndex((e) => e._id === deletePost._id)
                        if (idx >= 0) {
                            const newData = {...storeData.posts, results: [...storeData.posts.results]}
                            if (deletePost.status === 'deleting') {
                                newData.results[idx] = {...newData.results[idx], status: 'deleting'}
                            } else {
                                newData.results.splice(idx, 1)
                                newData.total = Math.max(0, (newData.total || 1) - 1)
                            }
                            store.writeQuery({query: gqlQuery, variables, data: {...storeData, posts: newData}})
                        }
                    }
                })
            }
        })
    })
)(PostContainer)


export default PostContainerWithGql
