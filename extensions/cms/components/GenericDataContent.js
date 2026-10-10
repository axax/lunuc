import React from 'react'
import CmsViewContainer from '../containers/CmsViewContainer'
import {client} from '../../../client/middleware/graphql'
import {_t} from '../../../util/i18n.mjs'
import {DEFAULT_TEMPLATE_MINIMAL} from '../constants/cmsDefaults.mjs'

/**
 * Edits a CmsEditor field of a GenericData entry directly on the page (inline), e.g. the content of a
 * Jahresbericht Beitrag, instead of opening the form of the entry.
 *
 * Use it only in edit mode, outside of it render the content as usual:
 *   {"$is": "${editMode}", "t": "GenericDataContent",
 *    "p": {"dataId": "<id of the entry>", "genericType": "ThalGeschaeftsberichtBeitrag", "field": "content", "value": "<json>"}}
 *
 * The field is rendered in an own (local) cms editor: elements are edited and dragged in like in the form.
 * Until the pointer/focus reaches the content it is only rendered (no editor), see `active`.
 * Every change is saved after a short delay as partial update of data.<field> (other fields stay untouched).
 */

const definitionIds = {}
const getDefinitionId = genericType => {
    if (!definitionIds[genericType]) {
        definitionIds[genericType] = client.query({
            fetchPolicy: 'cache-first',
            query: 'query genericDataDefinitions($filter:String,$limit:Int){genericDataDefinitions(filter:$filter,limit:$limit){results{_id name}}}',
            variables: {limit: 1, filter: `name=="${genericType}"`}
        }).then(({data}) => {
            const def = data?.genericDataDefinitions?.results?.find(d => d.name === genericType)
            if (!def) {
                delete definitionIds[genericType]
                throw new Error(`GenericDataDefinition ${genericType} not found`)
            }
            return def._id
        })
    }
    return definitionIds[genericType]
}

const notify = message => _app_.dispatcher.addNotification({
    horizontal: 'right',
    autoHideDuration: 5000,
    closeButton: true,
    message
})

export default function GenericDataContent({dataId, genericType, field = 'content', value, className, saveDelay = 600}) {
    const _id = dataId
    // the json of the editor; the parent can re-render with stale data until the page is reloaded,
    // so the value is only taken over initially
    const latest = React.useRef(value && value.trim() ? value : DEFAULT_TEMPLATE_MINIMAL)
    const saved = React.useRef(latest.current)
    const timer = React.useRef(null)
    // '' | 'pending' | 'saving' | 'saved' | 'error', shown as small badge
    const [status, setStatus] = React.useState('')
    // the editor (helpers, toolbars, drop areas) is only started when the user gets near the content.
    // A report with many entries would otherwise mount one full cms editor per entry on page load.
    const [active, setActive] = React.useState(false)
    const activate = React.useCallback(() => setActive(true), [])

    // the "saved" badge disappears again after a moment (errors stay visible)
    React.useEffect(() => {
        if (status === 'saved') {
            const t = setTimeout(() => setStatus(current => current === 'saved' ? '' : current), 2000)
            return () => clearTimeout(t)
        }
    }, [status])
    const cmsData = React.useMemo(() => ({slug: '', template: latest.current, style: ''}), [_id, field])

    const save = React.useCallback(() => {
        clearTimeout(timer.current)
        timer.current = null
        const template = latest.current
        if (template === saved.current || !_id || !genericType) {
            setStatus('')
            return
        }
        setStatus('saving')
        getDefinitionId(genericType).then(definition => client.mutate({
            mutation: 'mutation updateGenericData($_id:ID!,$data:String,$definition:ID,$_meta:String){updateGenericData(_id:$_id,data:$data,definition:$definition,_meta:$_meta){_id status}}',
            variables: {
                _id,
                definition,
                data: JSON.stringify({[field]: template}),
                // only data.<field> is changed, the other fields of the entry stay as they are
                _meta: JSON.stringify({partialUpdate: true})
            }
        })).then(() => {
            saved.current = template
            setStatus(latest.current === template ? 'saved' : 'pending')
        }).catch(e => {
            console.error(e)
            setStatus('error')
            notify(_t('GenericDataContent.saveError', {message: e.message}))
        })
    }, [_id, genericType, field])

    // pending changes are saved when the component goes away (e.g. edit mode switched off)
    React.useEffect(() => () => {
        if (timer.current) {
            save()
        }
    }, [save])

    const activateProps = active ? {} : {onMouseEnter: activate, onFocus: activate, onPointerDown: activate, onTouchStart: activate}

    return <div className={className} data-generic-data-content={_id} data-generic-data-content-active={active}
                style={{position: 'relative'}} {...activateProps}>
        {status && <span data-generic-data-content-status={status} style={{
            position: 'absolute', right: 0, top: '-1.6em', zIndex: 2, fontSize: '0.7rem', lineHeight: 1.4,
            padding: '0.1em 0.5em', borderRadius: '3px', color: '#fff', fontFamily: 'sans-serif',
            background: status === 'error' ? '#b42318' : status === 'saved' ? '#2e7d32' : '#757575'
        }}>{_t('GenericDataContent.status.' + status)}</span>}
        {!active ? <CmsViewContainer key={'gdc-view-' + _id + '-' + field}
                                      slug=""
                                      _parentInlineEditor={false}
                                      cmsData={cmsData}/> :
        <CmsViewContainer key={'gdc-' + _id + '-' + field}
                          slug=""
                          forceEditMode={true}
                          cmsData={cmsData}
                          onCmsDataChange={cmsPage => {
                              latest.current = cmsPage.template
                              setStatus('pending')
                              clearTimeout(timer.current)
                              timer.current = setTimeout(save, saveDelay)
                          }}/>}
    </div>
}
