import React from 'react'
import {Button} from 'ui/admin'
import {client} from 'client/middleware/graphql'
import {_t} from '../../../util/i18n.mjs'

/*
 Trash of the media library (admins): media deleted through Lunuc, newest first. The entry is
 restored from the History, the file from uploads/.trash (kept there for 30 days).
 */
const PAGE_SIZE = 50
const QUERY = `query deletedMedia($limit:Int,$offset:Int,$search:String){deletedMedia(limit:$limit,offset:$offset,search:$search){results{_id name mimeType size deletedAt deletedBy inTrash} hasMore}}`
const RESTORE = `mutation restoreMedia($_id:[ID]!){restoreMedia(_id:$_id){_id status}}`

const formatDate = ms => new Date(ms).toLocaleString()

export default function MediaTrash({onRestored}) {
    const [items, setItems] = React.useState([])
    const [offset, setOffset] = React.useState(0)
    const [hasMore, setHasMore] = React.useState(false)
    const [search, setSearch] = React.useState('')
    const [selected, setSelected] = React.useState({})
    const [loading, setLoading] = React.useState(false)
    const [message, setMessage] = React.useState('')

    const load = (newOffset, searchValue, append) => {
        setLoading(true)
        client.query({
            fetchPolicy: 'network-only',
            query: QUERY,
            variables: {limit: PAGE_SIZE, offset: newOffset, search: searchValue || undefined}
        }).then(({data}) => {
            const result = data.deletedMedia
            setItems(prev => append ? prev.concat(result.results) : result.results)
            setHasMore(result.hasMore)
            // the offset counts History entries: next page starts after this page
            setOffset(newOffset + PAGE_SIZE)
        }).catch(() => {}).finally(() => setLoading(false))
    }

    // reload after a pause while typing
    React.useEffect(() => {
        const timeout = setTimeout(() => {
            setSelected({})
            load(0, search, false)
        }, 300)
        return () => clearTimeout(timeout)
    }, [search])

    const selectedIds = Object.keys(selected).filter(id => selected[id])

    const restore = () => {
        setLoading(true)
        client.mutate({mutation: RESTORE, variables: {_id: selectedIds}}).then(({data}) => {
            const result = data.restoreMedia || []
            const restored = result.filter(r => r.status === 'restored').length
            const withoutFile = result.filter(r => r.status === 'restored_without_file').length
            setMessage(_t('Media.trashRestored', {restored, withoutFile}))
            setItems(prev => prev.filter(item => !result.some(r => r._id === item._id && r.status.startsWith('restored'))))
            setSelected({})
            if (onRestored) onRestored()
        }).catch(() => {}).finally(() => setLoading(false))
    }

    return <div>
        <p style={{marginTop: 0}}>{_t('Media.trashInfo')}</p>
        <input type="search" value={search} placeholder={_t('Media.trashSearch')}
               onChange={e => setSearch(e.target.value)}
               style={{width: '100%', padding: '0.5rem', marginBottom: '0.5rem', boxSizing: 'border-box'}}/>
        {message && <p><strong>{message}</strong></p>}
        <div style={{maxHeight: '50vh', overflow: 'auto'}}>
            <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem'}}>
                <thead>
                <tr style={{textAlign: 'left'}}>
                    <th><input type="checkbox"
                               checked={items.length > 0 && selectedIds.length === items.length}
                               onChange={e => setSelected(e.target.checked ? Object.fromEntries(items.map(i => [i._id, true])) : {})}/></th>
                    <th>{_t('Media.trashName')}</th>
                    <th>{_t('Media.trashDeletedAt')}</th>
                    <th>{_t('Media.trashDeletedBy')}</th>
                    <th>{_t('Media.trashFile')}</th>
                </tr>
                </thead>
                <tbody>
                {items.map(item => <tr key={item._id} style={{borderTop: '1px solid rgba(128,128,128,0.2)'}}>
                    <td><input type="checkbox" checked={!!selected[item._id]}
                               onChange={e => setSelected({...selected, [item._id]: e.target.checked})}/></td>
                    <td>{item.name}<br/><small style={{opacity: 0.6}}>{item._id} · {item.mimeType}</small></td>
                    <td>{formatDate(item.deletedAt)}</td>
                    <td>{item.deletedBy}</td>
                    <td>{item.inTrash ? '✓' : _t('Media.trashNoFile')}</td>
                </tr>)}
                {!loading && items.length === 0 && <tr>
                    <td colSpan={5}>{_t('Media.trashEmpty')}</td>
                </tr>}
                </tbody>
            </table>
        </div>
        <div style={{display: 'flex', gap: '0.5rem', marginTop: '1rem'}}>
            <Button variant="contained" color="primary" disabled={loading || !selectedIds.length} onClick={restore}>
                {_t('Media.trashRestore', {count: selectedIds.length})}
            </Button>
            {hasMore && <Button disabled={loading} onClick={() => load(offset, search, true)}>{_t('Media.trashMore')}</Button>}
        </div>
    </div>
}
