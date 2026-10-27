import React from 'react'
import {SimpleDialog, SimpleSelect, SimpleSwitch, TextField, Button, CircularProgress} from 'ui/admin'
import {client} from '../../../client/middleware/graphql'
import {bytesToBase64} from '../../../client/util/typeFiles'

const STATES = ['subscribed', 'optin', 'unsubscribed', 'invalid']

const gqlError = (response) => response && response.errors && response.errors.length > 0 ? new Error(response.errors[0].message) : null

const slugKey = (name) => String(name || '').trim()
    .replace(/^asp_?\s*/i, '')
    .replace(/[^\p{L}\p{N}]+(.)?/gu, (m, c) => c ? c.toUpperCase() : '')
    .replace(/^./, c => c.toLowerCase())

const SubscriberImportDialog = ({onClose, onImported}) => {
    const [mode, setMode] = React.useState('import')
    const [file, setFile] = React.useState(null)
    const [data, setData] = React.useState(null)
    const [info, setInfo] = React.useState(null)
    const [sheet, setSheet] = React.useState('')
    const [headerRow, setHeaderRow] = React.useState('')
    const [emailColumn, setEmailColumn] = React.useState('')
    const [lists, setLists] = React.useState([])
    const [availableLists, setAvailableLists] = React.useState([])
    const [state, setState] = React.useState('subscribed')
    const [confirmed, setConfirmed] = React.useState(true)
    const [language, setLanguage] = React.useState('')
    const [overwrite, setOverwrite] = React.useState(false)
    const [keepUnsubscribed, setKeepUnsubscribed] = React.useState(true)
    const [metaRows, setMetaRows] = React.useState([])
    const [fixedMeta, setFixedMeta] = React.useState('')
    const [busy, setBusy] = React.useState(false)
    const [error, setError] = React.useState(null)
    const [result, setResult] = React.useState(null)
    const fileInput = React.useRef(null)

    React.useEffect(() => {
        client.query({
            fetchPolicy: 'network-only',
            query: 'query newsletterLists{newsletterLists(limit:500){results{_id name}}}'
        }).then(response => {
            const results = response.data && response.data.newsletterLists && response.data.newsletterLists.results
            setAvailableLists((results || []).map(l => ({value: l._id, name: l.name})))
        }).catch(e => setError(e.message))
    }, [])

    const analyze = async (fileData, opts = {}) => {
        setBusy(true)
        setError(null)
        try {
            const response = await client.mutate({
                mutation: 'mutation analyzeSubscriberFile($data:String!,$sheet:String,$headerRow:Int){analyzeSubscriberFile(data:$data,sheet:$sheet,headerRow:$headerRow){sheets sheet headerRow rowCount emailColumn columns{index name samples filled}}}',
                variables: {data: fileData, sheet: opts.sheet || undefined, headerRow: opts.headerRow || undefined}
            })
            const err = gqlError(response)
            if (err) throw err
            const res = response.data.analyzeSubscriberFile
            setInfo(res)
            setSheet(res.sheet)
            setHeaderRow(res.headerRow)
            setEmailColumn(prev => (opts.keepSelection && prev !== '' && res.columns.some(c => String(c.index) === prev)) ? prev : (res.emailColumn === null ? '' : String(res.emailColumn)))
            setMetaRows(prev => opts.keepSelection ? prev.filter(m => res.columns.some(c => String(c.index) === m.column)) : [])
        } catch (e) {
            setError(e.message)
        } finally {
            setBusy(false)
        }
    }

    const onFileChange = async (e) => {
        const f = e.target.files && e.target.files[0]
        e.target.value = ''
        if (!f) return
        setResult(null)
        setFile(f)
        const fileData = bytesToBase64(await f.arrayBuffer())
        setData(fileData)
        analyze(fileData)
    }

    const columnItems = info ? info.columns.map(c => ({value: String(c.index), name: `${c.name}${c.samples.length ? ' (' + c.samples[0] + ')' : ''}`})) : []

    let fixedMetaError = null
    if (fixedMeta.trim()) {
        try {
            const o = JSON.parse(fixedMeta)
            if (!o || o.constructor !== Object) fixedMetaError = 'Muss ein JSON-Objekt sein, z.B. {"isDu": true}'
        } catch (e) {
            fixedMetaError = 'Kein gültiges JSON'
        }
    }

    const removeMode = mode === 'remove'
    const canImport = !!data && emailColumn !== '' && lists.length > 0 && !busy &&
        (removeMode || (!fixedMetaError && metaRows.every(m => m.column !== '' && m.key.trim())))

    const run = async (dryRun) => {
        setBusy(true)
        setError(null)
        setResult(null)
        try {
            if (removeMode) {
                const response = await client.mutate({
                    mutation: 'mutation removeSubscribersFromLists($data:String!,$sheet:String,$headerRow:Int!,$emailColumn:Int!,$lists:[ID],$dryRun:Boolean){removeSubscribersFromLists(data:$data,sheet:$sheet,headerRow:$headerRow,emailColumn:$emailColumn,lists:$lists,dryRun:$dryRun){total removed notInList notFound invalid empty duplicates invalidExamples dryRun}}',
                    variables: {data, sheet, headerRow: parseInt(headerRow), emailColumn: parseInt(emailColumn), lists, dryRun}
                })
                const err = gqlError(response)
                if (err) throw err
                setResult({...response.data.removeSubscribersFromLists, remove: true})
                if (!dryRun && onImported) onImported()
                return
            }
            const response = await client.mutate({
                mutation: 'mutation importSubscribers($data:String!,$sheet:String,$headerRow:Int!,$emailColumn:Int!,$metaMapping:String,$fixedMeta:String,$lists:[ID],$overwrite:Boolean,$keepUnsubscribed:Boolean,$state:String,$confirmed:Boolean,$language:String,$dryRun:Boolean){importSubscribers(data:$data,sheet:$sheet,headerRow:$headerRow,emailColumn:$emailColumn,metaMapping:$metaMapping,fixedMeta:$fixedMeta,lists:$lists,overwrite:$overwrite,keepUnsubscribed:$keepUnsubscribed,state:$state,confirmed:$confirmed,language:$language,dryRun:$dryRun){total created updated unchanged skippedUnsubscribed invalid empty duplicates invalidExamples dryRun}}',
                variables: {
                    data,
                    sheet,
                    headerRow: parseInt(headerRow),
                    emailColumn: parseInt(emailColumn),
                    metaMapping: JSON.stringify(metaRows.map(m => ({column: parseInt(m.column), key: m.key.trim()}))),
                    fixedMeta: fixedMeta.trim() || undefined,
                    lists,
                    overwrite,
                    keepUnsubscribed,
                    state,
                    confirmed,
                    language: language.trim() || undefined,
                    dryRun
                }
            })
            const err = gqlError(response)
            if (err) throw err
            setResult(response.data.importSubscribers)
            if (!dryRun && onImported) onImported()
        } catch (e) {
            setError(e.message)
        } finally {
            setBusy(false)
        }
    }

    const row = {display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap'}

    return <SimpleDialog open={true} maxWidth="md" fullWidth={true}
                         title={removeMode ? 'Adressen aus Liste entfernen (Excel)' : 'Adressen aus Excel importieren'}
                         actions={[
                             {key: 'close', label: 'Schliessen'},
                             {key: 'dry', label: 'Testlauf', variant: 'outlined', disabled: !canImport},
                             {key: 'import', label: removeMode ? 'Entfernen' : 'Importieren', variant: 'contained', disabled: !canImport}
                         ]}
                         onClose={(action) => {
                             if (action.key === 'dry') run(true)
                             else if (action.key === 'import') run(false)
                             else onClose()
                         }}>
        <div style={row}>
            <SimpleSelect label="Aktion" value={mode} style={{minWidth: '20rem'}}
                          items={[{value: 'import', name: 'Adressen importieren / zu Liste hinzufügen'}, {value: 'remove', name: 'Adressen aus Liste entfernen'}]}
                          onChange={e => {
                              setMode(e.target.value)
                              setResult(null)
                          }}/>
        </div>
        <div style={row}>
            <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" style={{display: 'none'}} onChange={onFileChange}/>
            <Button variant="outlined" onClick={() => fileInput.current.click()}>Datei wählen…</Button>
            <span>{file ? `${file.name}${info ? ` – ${info.rowCount} Zeilen` : ''}` : 'Keine Datei gewählt'}</span>
            {busy && <CircularProgress size={20}/>}
        </div>

        {info && <>
            <div style={row}>
                {info.sheets.length > 1 && <SimpleSelect label="Tabellenblatt" value={sheet}
                                                         items={info.sheets.map(s => ({value: s, name: s}))}
                                                         onChange={e => analyze(data, {sheet: e.target.value})}/>}
                <TextField label="Zeile mit den Spaltennamen" type="number" size="small" value={headerRow}
                           style={{width: '12rem'}}
                           onChange={e => setHeaderRow(e.target.value)}
                           onBlur={() => parseInt(headerRow) > 0 && parseInt(headerRow) !== info.headerRow && analyze(data, {sheet, headerRow: parseInt(headerRow), keepSelection: true})}/>
            </div>

            <div style={row}>
                <SimpleSelect label="Spalte mit der E-Mail Adresse" value={emailColumn} items={columnItems}
                              style={{minWidth: '20rem'}}
                              onChange={e => setEmailColumn(e.target.value)}/>
            </div>

            <div style={row}>
                <SimpleSelect label={removeMode ? 'Aus diesen Listen entfernen' : 'Listen (werden hinzugefügt)'} multi={true} value={lists} items={availableLists}
                              style={{minWidth: '20rem'}}
                              onChange={e => setLists(e.target.value)}/>
            </div>

            {!removeMode && <>
            <h4 style={{margin: '1.5rem 0 0.5rem'}}>Weitere Spalten → Meta</h4>
            {metaRows.map((m, i) => <div key={i} style={row}>
                <SimpleSelect label="Spalte" value={m.column} items={columnItems} style={{minWidth: '16rem'}}
                              onChange={e => {
                                  const column = e.target.value
                                  const col = info.columns.find(c => String(c.index) === column)
                                  setMetaRows(metaRows.map((x, j) => j === i ? {column, key: x.key || slugKey(col && col.name)} : x))
                              }}/>
                <span>→</span>
                <TextField label="Meta-Feld" size="small" value={m.key}
                           onChange={e => setMetaRows(metaRows.map((x, j) => j === i ? {...x, key: e.target.value} : x))}/>
                <Button size="small" onClick={() => setMetaRows(metaRows.filter((x, j) => j !== i))}>Entfernen</Button>
            </div>)}
            <div style={row}>
                <Button size="small" variant="outlined"
                        onClick={() => setMetaRows([...metaRows, {column: '', key: ''}])}>+ Spalte zuordnen</Button>
            </div>
            <TextField label='Feste Meta-Werte für alle (JSON, optional), z.B. {"ad": "BG", "isDu": true}'
                       size="small" fullWidth={true} value={fixedMeta}
                       error={!!fixedMetaError} helperText={fixedMetaError}
                       onChange={e => setFixedMeta(e.target.value)}/>

            <h4 style={{margin: '1.5rem 0 0.5rem'}}>Neue Adressen / Überschreiben</h4>
            <div style={row}>
                <SimpleSelect label="Status" value={state} items={STATES.map(s => ({value: s, name: s}))}
                              onChange={e => setState(e.target.value)}/>
                <SimpleSwitch label="Bestätigt" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>
                <TextField label="Sprache (optional)" size="small" value={language} style={{width: '10rem'}}
                           onChange={e => setLanguage(e.target.value)}/>
            </div>
            <div style={row}>
                <SimpleSwitch label="Überschreiben" checked={overwrite} onChange={e => setOverwrite(e.target.checked)}/>
                {overwrite && <SimpleSwitch label="Abgemeldete (unsubscribed) nicht überschreiben" checked={keepUnsubscribed}
                                            onChange={e => setKeepUnsubscribed(e.target.checked)}/>}
            </div>
            <div style={{fontSize: '0.85rem', opacity: 0.75, marginBottom: '1rem'}}>
                Bereits vorhandene Adressen bekommen immer die gewählten Listen dazu. Status, Bestätigt, Sprache und
                Meta-Werte werden nur mit «Überschreiben» angepasst (ohne «Überschreiben» werden nur fehlende Meta-Felder ergänzt).
            </div>
            </>}
        </>}

        {error && <div style={{color: 'red', marginTop: '1rem'}}>{error}</div>}
        {result && <div style={{marginTop: '1rem', padding: '0.75rem', border: '1px solid currentColor', borderRadius: 4}}>
            <strong>{result.dryRun ? 'Testlauf (nichts gespeichert)' : (result.remove ? 'Entfernen abgeschlossen' : 'Import abgeschlossen')}</strong>
            <div>Eindeutige Adressen in der Datei: {result.total}</div>
            {result.remove ?
                <div>Aus Liste entfernt: {result.removed} · Waren nicht in der Liste: {result.notInList} · Nicht gefunden: {result.notFound}</div> :
                <div>Neu: {result.created} · Aktualisiert: {result.updated} · Unverändert: {result.unchanged}</div>}
            <div>Doppelt in der Datei (zusammengeführt): {result.duplicates} · Ungültig: {result.invalid} · Zeilen ohne E-Mail: {result.empty}</div>
            {result.skippedUnsubscribed > 0 && <div>Abgemeldete nicht überschrieben: {result.skippedUnsubscribed}</div>}
            {result.invalidExamples && result.invalidExamples.length > 0 &&
                <div style={{fontSize: '0.85rem', marginTop: '0.5rem'}}>Ungültig, z.B.: {result.invalidExamples.join(' · ')}</div>}
        </div>}
    </SimpleDialog>
}

export default SubscriberImportDialog
