import React from 'react'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import ListItemText from '@mui/material/ListItemText'
import ListItemIcon from '@mui/material/ListItemIcon'
import Divider from '@mui/material/Divider'
import CheckIcon from '@mui/icons-material/Check'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import {SimpleDialog} from 'ui/admin'
import {client} from '../../../client/middleware/graphql'
import {COLLECTIONS_QUERY} from '../../../client/constants/admin.mjs'
import {useKeyValuesGlobal, setKeyValue} from '../../../client/util/keyvalue'
import {parseCollectionVersion, getLiveVersion, DEFAULT_VERSION} from '../../../client/util/collectionVersions.mjs'
import Util from '../../../client/util/index.mjs'
import {CAPABILITY_MANAGE_COLLECTION} from '../../../util/capabilities.mjs'
import {_t} from '../../../util/i18n.mjs'
import {getSlugVersion} from '../util/cmsView.mjs'

const TYPE = 'CmsPage'

/*
 * Version of the cms page in the editor header (where "Online" was shown).
 * - shows which version is edited and whether it is live
 * - lists the versions (loaded only when the menu is opened) and opens the page in another version
 *   (/@<version>/<slug>) - switching only changes what is edited, not what visitors see
 * - "set live" switches the version for all visitors, after a confirmation
 * Only for users who may manage collections (the collections query needs that capability).
 */
const CmsVersionSwitcher = ({slug, history, user}) => {
    const [anchor, setAnchor] = React.useState(null)
    const [versions, setVersions] = React.useState(null)
    const [error, setError] = React.useState(null)
    const [confirmLive, setConfirmLive] = React.useState(null)
    const selected = useKeyValuesGlobal(['TypesSelectedVersions'], {})

    const {slug: plainSlug, _version: urlVersion} = getSlugVersion(slug || '')
    const live = getLiveVersion(selected.data && selected.data['TypesSelectedVersions'], TYPE)
    // without @version in the url the editor works on the live version (buildCollectionName)
    const edited = urlVersion || live
    const isLive = edited === live

    const labelOf = (value) => {
        if (value === DEFAULT_VERSION) {
            return 'Default'
        }
        const v = versions && versions.find(v => v.value === value)
        return v ? (v.name || v.value) : parseCollectionVersion(TYPE, TYPE + '_' + value).name || value
    }

    const open = (e) => {
        setAnchor(e.currentTarget)
        if (!versions) {
            client.query({query: COLLECTIONS_QUERY, variables: {filter: '^' + TYPE + '_.*'}, fetchPolicy: 'network-only'})
                .then(res => {
                    const results = (res && res.data && res.data.collections && res.data.collections.results) || []
                    setVersions(results.map(c => parseCollectionVersion(TYPE, c.name))
                        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)))
                })
                .catch(e => setError(e && e.error ? e.error.message : String(e)))
        }
    }

    const goTo = (value) => {
        setAnchor(null)
        if (value === edited) {
            return
        }
        // the live version is opened without @version, like visitors see it
        history.push('/' + (value === live ? plainSlug : '@' + value + '/' + plainSlug))
    }

    const setLive = () => {
        const value = confirmLive
        setConfirmLive(null)
        const current = (selected.data && selected.data['TypesSelectedVersions']) || {}
        setKeyValue({key: 'TypesSelectedVersions', value: {...current, [TYPE]: value}, global: true}).then(() => {
            // pages of the previous version are cached in the client: start fresh with the live version
            location.href = location.href.replace('/@' + value + '/', '/')
        })
    }

    if (!Util.hasCapability(user, CAPABILITY_MANAGE_COLLECTION) || selected.loading) {
        return null
    }

    const items = [{value: DEFAULT_VERSION, name: 'Default'}].concat(versions || [])

    return <>
        <span role="button" tabIndex={0} onClick={open}
              onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && open(e)}
              title={_t('CmsVersionSwitcher.hint')}
              style={{
                  display: 'inline-flex', alignItems: 'center', cursor: 'pointer', marginLeft: '0.5rem',
                  padding: '0.0625rem 0.25rem 0.0625rem 0.5rem', borderRadius: '1rem', fontSize: '0.8125rem',
                  verticalAlign: 'middle', whiteSpace: 'nowrap',
                  background: isLive ? 'rgba(46,125,50,0.15)' : 'rgba(237,108,2,0.2)',
                  color: isLive ? '#2e7d32' : '#b45309', fontWeight: isLive ? 'normal' : 'bold'
              }}>
            {isLive ? _t('CmsVersionSwitcher.online') : _t('CmsVersionSwitcher.notLive')}
            {' · '}{labelOf(edited)}
            <ExpandMoreIcon style={{fontSize: '1rem'}}/>
        </span>
        <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)} sx={{zIndex: 10001}}>
            {items.map(item => <MenuItem key={item.value} selected={item.value === edited} onClick={() => goTo(item.value)}>
                <ListItemIcon>{item.value === edited ? <CheckIcon fontSize="small"/> : null}</ListItemIcon>
                <ListItemText primary={(item.name || item.value) + (item.value === live ? ' · ' + _t('ManageCollectionClones.live') : '')}
                              secondary={item.timestamp ? Util.formattedDatetime(item.timestamp) : null}/>
            </MenuItem>)}
            {!versions && !error && <MenuItem disabled>{_t('CmsVersionSwitcher.loading')}</MenuItem>}
            {error && <MenuItem disabled>{error}</MenuItem>}
            {!isLive && <Divider/>}
            {!isLive && <MenuItem onClick={() => {
                setAnchor(null)
                setConfirmLive(edited)
            }}>
                <ListItemText primary={_t('CmsVersionSwitcher.setLive', {name: labelOf(edited)})}
                              secondary={_t('CmsVersionSwitcher.setLiveHint')}/>
            </MenuItem>}
        </Menu>
        {confirmLive && <SimpleDialog open={true} maxWidth="sm"
                                      title={_t('ManageCollectionClones.deployTitle')}
                                      onClose={(action) => action && action.key === 'yes' ? setLive() : setConfirmLive(null)}
                                      actions={[{key: 'no', label: _t('core.cancel')},
                                          {key: 'yes', label: _t('ManageCollectionClones.deploy'), type: 'primary'}]}>
            {_t('ManageCollectionClones.deployText', {name: labelOf(confirmLive)})}
        </SimpleDialog>}
    </>
}

export default CmsVersionSwitcher
