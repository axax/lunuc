import React from 'react'
import CmsViewContainer from '../containers/CmsViewContainer'
import {client} from '../../../client/middleware/graphql'
import {_t} from '../../../util/i18n.mjs'
import {DEFAULT_TEMPLATE_MINIMAL} from '../constants/cmsDefaults.mjs'
import {pushExternalHistory} from '../util/editHistory.mjs'

/**
 * Edits a CmsEditor field of a GenericData entry directly on the page (inline), e.g. the content of a
 * Jahresbericht Beitrag, instead of opening the form of the entry.
 *
 * Use it only in edit mode, outside of it render the content as usual:
 *   {"$is": "${editMode}", "t": "GenericDataContent",
 *    "p": {"dataId": "<id of the entry>", "genericType": "ThalGeschaeftsberichtBeitrag", "field": "content", "value": "<json>"}}
 *
 * The field is rendered in an own (local) cms editor: elements are edited and dragged in like in the form.
 * Until the pointer/focus reaches the content it is only rendered (no editor), see `active`; the optional prop
 * `preview` (json) is shown instead of `value` in that state.
 * Every change is saved after a short delay as partial update of data.<field> (other fields stay untouched).
 * Each save is an entry in the undo / redo history of the page editor (label: prop `label`, util/editHistory.mjs).
 *
 * `slots` (json or object): {"attribute": "data-jb-slot", "values": {"themenfelder": [<json>]}} shows generated
 * content in placeholder elements while editing (e.g. the cards instead of "Themenfelder (Kacheln ...)").
 * Only for the display, the placeholder stays in the saved content and can be moved or removed.
 */

// generated content must not be edited inline: its elements are not part of the edited json
const lockSlotJson = node => {
    if (Array.isArray(node)) return node.map(lockSlotJson)
    if (node && typeof node === 'object') {
        const copy = {...node, $inlineEditor: false}
        if (copy.c && typeof copy.c === 'object') copy.c = lockSlotJson(copy.c)
        return copy
    }
    return node
}
const parseSlots = slots => {
    if (!slots) return null
    let parsed = slots
    if (typeof slots === 'string') {
        try {
            parsed = JSON.parse(slots)
        } catch (e) {
            console.warn('GenericDataContent: invalid slots', e)
            return null
        }
    }
    if (!parsed || !parsed.values) return null
    const values = {}
    Object.keys(parsed.values).forEach(key => {
        if (parsed.values[key]) values[key] = lockSlotJson(parsed.values[key])
    })
    return {attribute: parsed.attribute, values}
}

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

// partial update of data.<field> of the entry
const saveField = ({_id, genericType, field, template}) => getDefinitionId(genericType).then(definition => client.mutate({
    mutation: 'mutation updateGenericData($_id:ID!,$data:String,$definition:ID,$_meta:String){updateGenericData(_id:$_id,data:$data,definition:$definition,_meta:$_meta){_id status}}',
    variables: {
        _id,
        definition,
        data: JSON.stringify({[field]: template}),
        // only data.<field> is changed, the other fields of the entry stay as they are
        _meta: JSON.stringify({partialUpdate: true})
    }
}))

const notify = message => _app_.dispatcher.addNotification({
    horizontal: 'right',
    autoHideDuration: 5000,
    closeButton: true,
    message
})

function GenericDataContentEditor({dataId, genericType, field = 'content', value, preview, slots, className, label, saveDelay = 600}) {
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
    const slotDefinition = React.useMemo(() => parseSlots(slots), [slots])
    // incremented when a version from the history is restored: the editor starts again with that content
    const [version, setVersion] = React.useState(0)
    // restores a content from the history while the editor is shown (null when it is gone)
    const restoreRef = React.useRef(null)

    // the "saved" badge disappears again after a moment (errors stay visible)
    React.useEffect(() => {
        if (status === 'saved') {
            const t = setTimeout(() => setStatus(current => current === 'saved' ? '' : current), 2000)
            return () => clearTimeout(t)
        }
    }, [status])
    const cmsData = React.useMemo(() => ({slug: '', template: latest.current, style: ''}), [_id, field, version])
    // until the editor starts the content is only shown; `preview` can be the rendered version of the content
    // (e.g. with generated parts like the cards of the Jahresbericht instead of their placeholders)
    const previewData = React.useMemo(() => ({slug: '', template: preview && preview.trim() && version === 0 ? preview : latest.current, style: ''}), [_id, field, preview, version])

    const save = React.useCallback(() => {
        clearTimeout(timer.current)
        timer.current = null
        const template = latest.current
        const before = saved.current
        if (template === before || !_id || !genericType) {
            setStatus('')
            return
        }
        setStatus('saving')
        saveField({_id, genericType, field, template}).then(() => {
            saved.current = template
            setStatus(latest.current === template ? 'saved' : 'pending')
            // undo / redo with the page history: restored in the editor if it is still shown, otherwise only saved
            const restore = content => {
                if (restoreRef.current) {
                    restoreRef.current(content)
                } else {
                    saveField({_id, genericType, field, template: content}).catch(e => {
                        console.error(e)
                        notify(_t('GenericDataContent.saveError', {message: e.message}))
                    })
                }
            }
            pushExternalHistory({
                label: label || _t('GenericDataContent.history'),
                undo: () => restore(before),
                redo: () => restore(template)
            })
        }).catch(e => {
            console.error(e)
            setStatus('error')
            notify(_t('GenericDataContent.saveError', {message: e.message}))
        })
    }, [_id, genericType, field, label])

    // the value of the parent changed (e.g. the entry was edited in its form, «Bericht bearbeiten»): show it.
    // Only a real change of the prop counts - a parent that re-renders with its old (stale) value after an inline
    // change keeps the edited content; pending inline changes are not overwritten
    const lastValue = React.useRef(value)
    React.useEffect(() => {
        if (value === lastValue.current) {
            return
        }
        lastValue.current = value
        const next = value && value.trim() ? value : DEFAULT_TEMPLATE_MINIMAL
        if (timer.current || next === latest.current) {
            return
        }
        latest.current = saved.current = next
        setVersion(v => v + 1)
    }, [value])

    // content from the history: shown in a fresh editor and saved (without a new history entry)
    React.useEffect(() => {
        restoreRef.current = content => {
            clearTimeout(timer.current)
            timer.current = null
            latest.current = content
            setVersion(v => v + 1)
            setStatus('saving')
            saveField({_id, genericType, field, template: content}).then(() => {
                saved.current = content
                setStatus('saved')
            }).catch(e => {
                console.error(e)
                setStatus('error')
                notify(_t('GenericDataContent.saveError', {message: e.message}))
            })
        }
        return () => {
            restoreRef.current = null
        }
    }, [_id, genericType, field])

    // pending changes are saved when the component goes away (e.g. edit mode switched off)
    React.useEffect(() => () => {
        if (timer.current) {
            save()
        }
    }, [save])

    const activateProps = active ? {} : {onMouseEnter: activate, onFocus: activate, onPointerDown: activate, onTouchStart: activate}

    return <div className={className} data-generic-data-content={_id} data-generic-data-content-active={active}
                data-drop-boundary="true"
                style={{position: 'relative'}} {...activateProps}>
        {status && <span data-generic-data-content-status={status} style={{
            position: 'absolute', right: 0, top: '-1.6em', zIndex: 2, fontSize: '0.7rem', lineHeight: 1.4,
            padding: '0.1em 0.5em', borderRadius: '3px', color: '#fff', fontFamily: 'sans-serif',
            background: status === 'error' ? '#b42318' : status === 'saved' ? '#2e7d32' : '#757575'
        }}>{_t('GenericDataContent.status.' + status)}</span>}
        {!active ? <CmsViewContainer key={'gdc-view-' + _id + '-' + field + '-' + version}
                                      slug=""
                                      _parentInlineEditor={false}
                                      slots={slotDefinition}
                                      cmsData={previewData}/> :
        <CmsViewContainer key={'gdc-' + _id + '-' + field + '-' + version}
                          // own key prefix: every entry has its own editor with its own json, without the prefix
                          // the element keys (0.0, 0.0.1 ...) of all entries on the page are the same and the
                          // helpers / drop areas of one entry are mixed up with the ones of another
                          _keyPrefix={'gdc_' + String(_id).replace(/[^a-zA-Z0-9]/g, '') + '_' + String(field).replace(/[^a-zA-Z0-9]/g, '')}
                          slug=""
                          forceEditMode={true}
                          slots={slotDefinition}
                          cmsData={cmsData}
                          onCmsDataChange={cmsPage => {
                              latest.current = cmsPage.template
                              setStatus('pending')
                              clearTimeout(timer.current)
                              timer.current = setTimeout(save, saveDelay)
                          }}/>}
    </div>
}

/**
 * One editor instance per entry and field: in a list (e.g. the beiträge of a bereich) the template engine
 * re-uses the component of a position for whatever entry is rendered there. After a reorder the editor
 * would keep the content of the previous entry and save it under the id of the new one. The key starts a
 * fresh editor instead (a pending change of the previous entry is still saved under its own id on unmount).
 */
export default function GenericDataContent(props) {
    return <GenericDataContentEditor key={(props.dataId || '') + '|' + (props.field || 'content')} {...props}/>
}
