import React from 'react'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import ListItemText from '@mui/material/ListItemText'
import CircularProgress from '@mui/material/CircularProgress'
import {styled} from '@mui/material/styles'
import LibraryAddIcon from '@mui/icons-material/LibraryAdd'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import {SimpleDialog} from 'ui/admin'
import {client} from '../../../client/middleware/graphql'
import {_t} from '../../../util/i18n.mjs'

const LIST_QUERY = 'query genericDataFieldTemplates($genericType:String!,$field:String!,$excludeId:ID){genericDataFieldTemplates(genericType:$genericType,field:$field,excludeId:$excludeId){_id label modifiedAt}}'
const VALUE_QUERY = 'query genericDataFieldTemplateValue($genericType:String!,$field:String!,$_id:ID!){genericDataFieldTemplateValue(genericType:$genericType,field:$field,_id:$_id){_id value}}'

// same look as the search field of the element palette
const StyledButton = styled('button')(({theme, dense}) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    width: '100%',
    boxSizing: 'border-box',
    margin: dense ? '0 0 8px 0' : '0 0 12px 0',
    padding: dense ? '6px 8px' : '8px 10px',
    borderRadius: '8px',
    border: `1px dashed ${theme.palette.divider}`,
    background: 'transparent',
    color: theme.palette.text.secondary,
    font: 'inherit',
    fontSize: '0.8rem',
    textAlign: 'left',
    cursor: 'pointer',
    transition: 'border-color .15s, color .15s, background-color .15s',
    '&:hover, &:focus-visible, &[aria-expanded="true"]': {
        borderColor: theme.palette.primary.main,
        color: theme.palette.text.primary,
        backgroundColor: theme.palette.action.hover,
        outline: 'none'
    },
    '&:disabled': {
        cursor: 'wait',
        opacity: 0.6
    },
    '& .label': {
        flex: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
    },
    '& svg': {
        fontSize: 18,
        flexShrink: 0
    },
    '& .icon': {
        color: theme.palette.primary.main
    }
}))

const formatDate = (ms) => {
    if (!ms) {
        return ''
    }
    try {
        return new Date(ms).toLocaleDateString()
    } catch (e) {
        return ''
    }
}

const firstError = (response) => response && response.errors && response.errors.length ? response.errors[0].message : null

/**
 * button that opens a menu with the other entries of the same generic type. Choosing one takes
 * over the value of the same field (e.g. the content of a CmsEditor field). If there is already
 * content the user has to confirm first. The entries are loaded when the menu is opened.
 *
 * props:
 * - source: {genericType, field, excludeId}
 * - hasContent: true if the current content would be replaced
 * - onApply(value, entry)
 */
export default function CmsTemplatePicker({source, hasContent, onApply, dense}) {
    const [entries, setEntries] = React.useState(null)
    const [error, setError] = React.useState(null)
    const [anchor, setAnchor] = React.useState(null)
    const [pending, setPending] = React.useState(null)
    const [loadingValue, setLoadingValue] = React.useState(false)

    const {genericType, field, excludeId} = source || {}

    // other entry / type -> load again on the next open
    React.useEffect(() => {
        setEntries(null)
        setError(null)
    }, [genericType, field, excludeId])

    if (!genericType || !field) {
        return null
    }

    const loadEntries = () => {
        setError(null)
        client.query({
            fetchPolicy: 'network-only',
            query: LIST_QUERY,
            variables: {genericType, field, excludeId}
        }).then(response => {
            setError(firstError(response))
            setEntries((response.data && response.data.genericDataFieldTemplates) || [])
        }).catch(e => {
            setError(e.message)
            setEntries([])
        })
    }

    const apply = (entry) => {
        setLoadingValue(true)
        client.query({
            fetchPolicy: 'network-only',
            query: VALUE_QUERY,
            variables: {genericType, field, _id: entry._id}
        }).then(response => {
            const message = firstError(response)
            if (message) {
                throw new Error(message)
            }
            onApply(response.data.genericDataFieldTemplateValue.value || '', entry)
        }).catch(e => {
            setError(e.message)
            setAnchor(null)
        }).finally(() => {
            setLoadingValue(false)
        })
    }

    const choose = (entry) => {
        setAnchor(null)
        if (hasContent) {
            setPending(entry)
        } else {
            apply(entry)
        }
    }

    return <>
        <StyledButton type="button"
                      dense={dense ? 1 : 0}
                      disabled={loadingValue}
                      aria-haspopup="menu"
                      aria-expanded={!!anchor}
                      onClick={(e) => {
                          setAnchor(e.currentTarget)
                          if (!entries) {
                              loadEntries()
                          }
                      }}>
            {loadingValue ? <CircularProgress size={16}/> : <LibraryAddIcon className="icon"/>}
            <span className="label">{_t('CmsTemplatePicker.button')}</span>
            <ExpandMoreIcon/>
        </StyledButton>

        <Menu anchorEl={anchor}
              open={!!anchor}
              onClose={() => setAnchor(null)}
              // above SimpleDialog (z-index 9999)
              sx={{zIndex: 10002}}
              slotProps={{paper: {sx: {maxHeight: 360, minWidth: 240, maxWidth: 360}}}}>
            {!entries && <MenuItem disabled dense>
                <CircularProgress size={14} sx={{mr: 1}}/>{_t('CmsTemplatePicker.loading')}
            </MenuItem>}
            {entries && error && <MenuItem disabled dense sx={{whiteSpace: 'normal'}}>{error}</MenuItem>}
            {entries && !error && entries.length === 0 && <MenuItem disabled dense sx={{whiteSpace: 'normal'}}>
                {_t('CmsTemplatePicker.noEntries')}
            </MenuItem>}
            {(entries || []).map(entry => <MenuItem key={entry._id} dense onClick={() => choose(entry)}>
                <ListItemText primary={entry.label}
                              secondary={formatDate(entry.modifiedAt)}
                              primaryTypographyProps={{fontSize: '0.85rem', noWrap: true}}
                              secondaryTypographyProps={{fontSize: '0.7rem'}}/>
            </MenuItem>)}
        </Menu>

        <SimpleDialog open={!!pending}
                      maxWidth="xs"
                      fullWidth
                      title={_t('CmsTemplatePicker.confirmTitle')}
                      onClose={(action) => {
                          if (action && action.key === 'replace' && pending) {
                              apply(pending)
                          }
                          setPending(null)
                      }}
                      actions={[
                          {key: 'cancel', label: _t('core.cancel')},
                          {key: 'replace', label: _t('CmsTemplatePicker.replace'), type: 'primary', variant: 'contained', autoFocus: true}
                      ]}>
            {pending ? _t('CmsTemplatePicker.confirmText', {name: pending.label}) : ''}
        </SimpleDialog>
    </>
}
