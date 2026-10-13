import React, {useCallback, useEffect, useRef, useState} from 'react'
import {SimpleDialog, TextField, InputAdornment, SearchIcon, Button, CircularProgress} from 'ui/admin'
import {client} from 'client/middleware/graphql'
import {getImageSrc} from 'client/util/media'
import {_t} from 'util/i18n.mjs'

const PAGE_SIZE = 40

const MEDIA_QUERY = `query medias($filter:String,$limit:Int,$page:Int,$sort:String){medias(filter:$filter,limit:$limit,page:$page,sort:$sort){total results{_id name mimeType src}}}`

const thumbnailSrc = (item) => {
    const src = getImageSrc(item, null)
    if (item.mimeType && item.mimeType.indexOf('svg') >= 0) {
        return src
    }
    return src + (src.indexOf('?') >= 0 ? '&' : '?') + 'format=webp&quality=65&width=240'
}

const styles = {
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
        gap: '10px',
        marginTop: '12px'
    },
    tile: {
        position: 'relative',
        border: '2px solid transparent',
        borderRadius: '8px',
        padding: 0,
        background: '#f3f4f6',
        cursor: 'pointer',
        overflow: 'hidden',
        textAlign: 'left'
    },
    tileSelected: {
        borderColor: '#1a73e8',
        boxShadow: '0 0 0 2px rgba(26,115,232,0.25)'
    },
    img: {
        display: 'block',
        width: '100%',
        height: '110px',
        objectFit: 'cover',
        background: '#e5e7eb'
    },
    name: {
        display: 'block',
        fontSize: '12px',
        padding: '4px 6px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        color: '#374151',
        background: '#fff'
    },
    badge: {
        position: 'absolute',
        top: 6,
        right: 6,
        minWidth: 22,
        height: 22,
        borderRadius: 11,
        background: '#1a73e8',
        color: '#fff',
        fontSize: 12,
        lineHeight: '22px',
        textAlign: 'center',
        fontWeight: 600
    },
    footer: {
        display: 'flex',
        justifyContent: 'center',
        padding: '16px 0 4px'
    },
    empty: {
        padding: '40px 0',
        textAlign: 'center',
        color: '#888'
    }
}

/**
 * Dialog zur Auswahl bestehender Bilder aus der Media-Verwaltung.
 * Klick wählt aus (Mehrfachauswahl möglich), Doppelklick fügt direkt ein.
 */
export default function MediaPickerDialog({open, onClose, onSelect}) {
    const [search, setSearch] = useState('')
    const [items, setItems] = useState([])
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [loading, setLoading] = useState(false)
    const [selected, setSelected] = useState([])
    const requestId = useRef(0)

    const load = useCallback((query, pageToLoad) => {
        const id = ++requestId.current
        setLoading(true)
        const filter = 'mimeType=image' + (query.trim() ? ' ' + query.trim() : '')
        client.query({
            query: MEDIA_QUERY,
            fetchPolicy: 'network-only',
            variables: {filter, limit: PAGE_SIZE, page: pageToLoad, sort: '_id desc'}
        }).then(({data}) => {
            if (id !== requestId.current) {
                return
            }
            const result = data && data.medias
            const results = (result && result.results) || []
            setItems(prev => pageToLoad === 1 ? results : [...prev, ...results])
            setTotal((result && result.total) || 0)
            setPage(pageToLoad)
        }).catch(e => console.error(e)).finally(() => {
            if (id === requestId.current) {
                setLoading(false)
            }
        })
    }, [])

    useEffect(() => {
        if (!open) {
            return
        }
        const t = setTimeout(() => load(search, 1), search ? 300 : 0)
        return () => clearTimeout(t)
    }, [open, search, load])

    useEffect(() => {
        if (open) {
            setSelected([])
        }
    }, [open])

    const toggle = (item) => {
        setSelected(prev => prev.find(s => s._id === item._id) ?
            prev.filter(s => s._id !== item._id) : [...prev, item])
    }

    const finish = (list) => {
        if (list.length) {
            onSelect(list.map(item => ({
                src: getImageSrc(item, null),
                altText: (item.name || '').replace(/\.[^.]+$/, ''),
                mediaId: item._id
            })))
        }
        onClose()
    }

    return <SimpleDialog open={open}
                         fullWidth
                         maxWidth="md"
                         fullScreenMobile
                         title={_t('Post.mediaPickerTitle')}
                         onClose={(action) => {
                             if (action && action.key === 'insert') {
                                 finish(selected)
                             } else {
                                 onClose()
                             }
                         }}
                         actions={[
                             {key: 'cancel', label: _t('Post.no')},
                             {
                                 key: 'insert',
                                 label: selected.length > 1 ?
                                     _t('Post.insertImages', {count: selected.length}) : _t('Post.insertImage'),
                                 type: 'primary',
                                 disabled: selected.length === 0
                             }
                         ]}>
        <TextField size="small"
                   fullWidth
                   autoFocus
                   placeholder={_t('Post.search')}
                   value={search}
                   onChange={e => setSearch(e.target.value)}
                   slotProps={{
                       input: {
                           startAdornment: <InputAdornment position="start">
                               <SearchIcon fontSize="small" style={{color: '#9ca3af'}}/>
                           </InputAdornment>
                       }
                   }}/>

        {items.length === 0 && !loading ?
            <div style={styles.empty}>{_t('Post.mediaPickerEmpty')}</div> :
            <div style={styles.grid}>
                {items.map(item => {
                    const index = selected.findIndex(s => s._id === item._id)
                    return <button type="button"
                                   key={item._id}
                                   title={item.name}
                                   style={{...styles.tile, ...(index >= 0 ? styles.tileSelected : null)}}
                                   onClick={() => toggle(item)}
                                   onDoubleClick={() => finish([item])}>
                        <img src={thumbnailSrc(item)} alt={item.name} loading="lazy" style={styles.img}/>
                        <span style={styles.name}>{item.name}</span>
                        {index >= 0 && <span style={styles.badge}>{index + 1}</span>}
                    </button>
                })}
            </div>}

        <div style={styles.footer}>
            {loading ? <CircularProgress size={24}/> :
                items.length < total &&
                <Button variant="outlined" size="small" onClick={() => load(search, page + 1)}>
                    {_t('Post.loadMore', {count: total - items.length})}
                </Button>}
        </div>
    </SimpleDialog>
}
