import React from 'react'
import {_t} from '../../util/i18n.mjs'

/*
 Result of an import of files (zip / dbscripts): counters as chips, the entries grouped by
 folder (cronjobs, apis, cmspages, ...) with a status badge, errors at the end.

 result: {created, updated, unchanged, skipped, names | slugs, errors}
 excluded / onToggle (optional, preview): entries with a change get a checkbox, excluded is an array
   of entry keys ("cronjobs/System__Foo", "cmspages/home") that are not imported

 Entry formats of the server (api/util/typeScriptFiles.mjs, extensions/cms/util/cmsPageFilesServer.mjs):
   "folder/name: created"            "folder/name: script, active"      "folder/name: ..., skipped"
   "slug (new)"                      "slug (template, script)"           "folder: conflict, ..."
*/

const COLORS = {
    created: {color: '#16a34a', bg: 'rgba(22,163,74,0.14)'},
    updated: {color: '#d97706', bg: 'rgba(217,119,6,0.14)'},
    unchanged: {color: 'inherit', bg: 'rgba(127,127,127,0.14)'},
    skipped: {color: 'inherit', bg: 'rgba(127,127,127,0.14)'},
    conflict: {color: '#dc2626', bg: 'rgba(220,38,38,0.14)'},
    error: {color: '#dc2626', bg: 'rgba(220,38,38,0.12)'}
}

const styles = {
    root: {fontSize: '0.9rem', lineHeight: 1.45, maxWidth: '40rem'},
    chips: {display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem'},
    chip: (c, active) => ({
        display: 'inline-flex', alignItems: 'baseline', gap: '0.35rem', padding: '0.3rem 0.7rem',
        borderRadius: '999px', background: c.bg, color: c.color, opacity: active ? 1 : 0.55
    }),
    chipCount: {fontWeight: 700, fontSize: '1.05rem'},
    group: {marginBottom: '0.9rem'},
    groupTitle: {
        fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
        opacity: 0.6, margin: '0 0 0.35rem'
    },
    list: {listStyle: 'none', margin: 0, padding: 0},
    item: {
        display: 'flex', alignItems: 'baseline', gap: '0.6rem', padding: '0.35rem 0',
        borderBottom: '1px solid rgba(127,127,127,0.18)'
    },
    // checkbox and badge share the height of the first text line, so they sit on one line with the name
    itemTop: {alignItems: 'flex-start'},
    lead: {flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: '0.5rem', height: '1.45em'},
    selectable: {cursor: 'pointer', userSelect: 'none', outline: 'none'},
    deselected: {opacity: 0.45},
    // display only: the click is handled by the row (a native toggle of a controlled checkbox in a
    // label can get out of sync with the state in preact)
    checkbox: {margin: 0, width: '1rem', height: '1rem', pointerEvents: 'none', accentColor: '#d97706'},
    groupHeader: {display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.5rem'},
    groupToggle: {
        border: 0, background: 'none', padding: 0, font: 'inherit', fontSize: '0.75rem', cursor: 'pointer',
        color: 'inherit', opacity: 0.6, textDecoration: 'underline'
    },
    badge: c => ({
        flex: '0 0 auto', fontSize: '0.72rem', fontWeight: 600, padding: '0.05rem 0.5rem',
        borderRadius: '4px', background: c.bg, color: c.color, minWidth: '5.5rem', textAlign: 'center'
    }),
    name: {fontWeight: 500, wordBreak: 'break-word'},
    detail: {opacity: 0.7, fontSize: '0.82rem', wordBreak: 'break-word'},
    errors: {marginTop: '0.5rem', padding: '0.6rem 0.8rem', borderRadius: '6px', background: COLORS.error.bg},
    errorTitle: {fontWeight: 600, color: COLORS.error.color, marginBottom: '0.3rem'},
    empty: {opacity: 0.7}
}

const GROUP_LABEL = {
    cmspages: 'CMS-Seiten', cronjobs: 'Cronjobs', apis: 'APIs', hooks: 'Hooks', genericdatadefinitions: 'Generic Data Definitions',
    botcommands: 'Bot-Commands'
}

const tr = (key, fallback) => {
    const value = _t(key)
    return value && value !== key ? value : fallback
}

/** "folder/name: text" or "slug (text)" -> {key, group, name, status, detail} (key: "folder/name" as the server names the entry) */
export const parseEntry = (entry) => {
    let label = entry, text = ''
    const colon = entry.indexOf(': ')
    const paren = entry.match(/^(.*?) \((.*)\)$/)
    if (colon > 0) {
        label = entry.substring(0, colon)
        text = entry.substring(colon + 2)
    } else if (paren) {
        label = paren[1]
        text = paren[2]
    }
    let status = 'updated', detail = text
    if (/^(created|new)\b/.test(text)) {
        status = 'created'
        detail = text.replace(/^(created|new)\s*/, '').replace(/^\((.*)\)$/, '$1')
    } else if (/conflict/.test(text)) {
        status = 'conflict'
    } else if (/skipped|does not exist|ignored/.test(text)) {
        status = 'skipped'
    } else if (/no permission/.test(text)) {
        status = 'conflict'
    } else if (text) {
        detail = tr('TypeFiles.changedFields', 'Geändert:') + ' ' + text
    }
    // first part of the path is the type folder (import of everything), otherwise no group
    const slash = label.indexOf('/')
    const first = slash > 0 ? label.substring(0, slash) : ''
    const group = GROUP_LABEL[first] ? first : ''
    let name = group ? label.substring(slash + 1) : label
    if (group && group !== 'cmspages' && group !== 'apis') {
        // folder names of entries: "System__Visitor_rollup" -> "System: Visitor rollup"
        name = name.replace(/__/g, ': ').replace(/_/g, ' ')
    }
    return {key: label, group, name: name || label, status, detail}
}

const STATUS_LABEL = {
    created: () => tr('TypeFiles.status.created', 'neu'),
    updated: () => tr('TypeFiles.status.updated', 'geändert'),
    skipped: () => tr('TypeFiles.status.skipped', 'übersprungen'),
    conflict: () => tr('TypeFiles.status.conflict', 'Konflikt')
}


// only entries that would be written can be deselected
const SELECTABLE = {created: true, updated: true}

const TypeFilesResult = ({result, excluded, onToggle}) => {
    if (!result) return null
    const selectable = typeof onToggle === 'function'
    const excludedSet = new Set(excluded || [])
    const entries = (result.names || result.slugs || []).map(parseEntry)
    const groups = []
    const byGroup = {}
    entries.forEach(e => {
        if (!byGroup[e.group]) {
            byGroup[e.group] = []
            groups.push(e.group)
        }
        byGroup[e.group].push(e)
    })
    const counters = [
        ['created', result.created, tr('TypeFiles.count.created', 'neu')],
        ['updated', result.updated, tr('TypeFiles.count.updated', 'geändert')],
        ['unchanged', result.unchanged, tr('TypeFiles.count.unchanged', 'unverändert')],
        ['skipped', result.skipped, tr('TypeFiles.count.skipped', 'übersprungen')]
    ]
    const errors = result.errors || []

    return <div style={styles.root}>
        <div style={styles.chips}>
            {counters.filter(([key, count]) => count !== undefined && count !== null).map(([key, count, label]) =>
                <span key={key} style={styles.chip(COLORS[key], count > 0)}>
                    <span style={styles.chipCount}>{count || 0}</span>
                    <span>{label}</span>
                </span>)}
            {errors.length > 0 && <span style={styles.chip(COLORS.error, true)}>
                <span style={styles.chipCount}>{errors.length}</span>
                <span>{tr('TypeFiles.count.errors', 'Fehler')}</span>
            </span>}
        </div>

        {entries.length === 0 && errors.length === 0 &&
            <div style={styles.empty}>{tr('TypeFiles.nothingChanged', 'Keine Änderungen.')}</div>}

        {groups.map(group => {
            const groupKeys = selectable ? byGroup[group].filter(e => SELECTABLE[e.status]).map(e => e.key) : []
            const allSelected = groupKeys.every(k => !excludedSet.has(k))
            return <div key={group || '-'} style={styles.group}>
                {(group || groupKeys.length > 1) && <div style={styles.groupHeader}>
                    <div style={styles.groupTitle}>{group ? GROUP_LABEL[group] || group : ''}</div>
                    {groupKeys.length > 1 && <button type="button" style={styles.groupToggle}
                                                     onClick={() => onToggle(groupKeys, !allSelected)}>
                        {allSelected ? tr('TypeFiles.deselectAll', 'keine') : tr('TypeFiles.selectAll', 'alle')}
                    </button>}
                </div>}
                <ul style={styles.list}>
                    {byGroup[group].map((e, i) => {
                        const canSelect = selectable && SELECTABLE[e.status]
                        const checked = !excludedSet.has(e.key)
                        const content = <>
                            <span style={styles.lead}>
                                {canSelect && <input type="checkbox" tabIndex={-1} readOnly style={styles.checkbox}
                                                     checked={checked} key={checked ? 'on' : 'off'}/>}
                                <span style={styles.badge(COLORS[e.status])}>{STATUS_LABEL[e.status]()}</span>
                            </span>
                            <span>
                                <span style={styles.name}>{e.name}</span>
                                {e.detail && <div style={styles.detail}>{e.detail}</div>}
                            </span>
                        </>
                        if (!canSelect) {
                            return <li key={i} style={{...styles.item, ...styles.itemTop}}>{content}</li>
                        }
                        const toggle = (ev) => {
                            ev.preventDefault()
                            onToggle([e.key], !checked)
                        }
                        return <li key={i} role="checkbox" aria-checked={checked} tabIndex={0}
                                   style={{...styles.item, ...styles.itemTop, ...styles.selectable, ...(checked ? {} : styles.deselected)}}
                                   onClick={toggle}
                                   onKeyDown={ev => (ev.key === ' ' || ev.key === 'Enter') && toggle(ev)}>{content}</li>
                    })}
                </ul>
            </div>
        })}

        {errors.length > 0 && <div style={styles.errors}>
            <div style={styles.errorTitle}>{tr('TypeFiles.count.errors', 'Fehler')}</div>
            <ul style={{margin: 0, paddingLeft: '1.1rem'}}>
                {errors.map((e, i) => <li key={i} style={{wordBreak: 'break-word'}}>{e}</li>)}
            </ul>
        </div>}
    </div>
}

export default TypeFilesResult
