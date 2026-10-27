import {ObjectId} from 'mongodb'

const EMAIL_REGEX = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/
const MAX_HEADER_SCAN = 30
const SAMPLE_COUNT = 3

const readWorkbook = async (buffer) => {
    const mod = await import('xlsx')
    const XLSX = mod.default || mod
    const wb = XLSX.read(buffer, {type: 'buffer', cellDates: false})
    return {XLSX, wb}
}

const cellToValue = (v) => {
    if (v === undefined || v === null) return null
    if (typeof v === 'boolean') return v
    if (typeof v === 'number') return v
    if (v instanceof Date) return v.toISOString()
    const s = String(v).trim()
    return s === '' ? null : s
}

/** all rows of a sheet as arrays (row index 0 = first excel row, empty rows are kept so row numbers match excel) */
const sheetRows = (XLSX, ws) => {
    if (!ws || !ws['!ref']) return []
    return XLSX.utils.sheet_to_json(ws, {header: 1, raw: true, defval: null, blankrows: true}).map(r => r.map(cellToValue))
}

/** first row that looks like a table header: several filled cells, not just a title */
export const detectHeaderRow = (rows) => {
    const counts = rows.slice(0, MAX_HEADER_SCAN).map(r => r.filter(c => c !== null).length)
    const max = Math.max(0, ...counts)
    if (max === 0) return 1
    const threshold = Math.max(2, Math.ceil(max * 0.6))
    const i = counts.findIndex(c => c >= threshold)
    return (i < 0 ? 0 : i) + 1
}

export const normalizeEmail = (value) => {
    if (value === null || value === undefined) return null
    let s = String(value).trim().replace(/^mailto:/i, '').replace(/^<|>$/g, '').trim().toLowerCase()
    return EMAIL_REGEX.test(s) ? s : null
}

const columnsOf = (rows, headerRow) => {
    const header = rows[headerRow - 1] || []
    const body = rows.slice(headerRow)
    const width = Math.max(header.length, ...body.slice(0, 200).map(r => r.length), 0)
    const cols = []
    for (let i = 0; i < width; i++) {
        const samples = []
        let emailLike = 0, filled = 0
        for (let j = 0; j < body.length; j++) {
            const v = body[j][i]
            if (v === null || v === undefined) continue
            filled++
            if (normalizeEmail(v)) emailLike++
            if (samples.length < SAMPLE_COUNT && !samples.includes(String(v))) samples.push(String(v))
        }
        const name = header[i] !== null && header[i] !== undefined ? String(header[i]) : ''
        cols.push({index: i, name: name.trim() || `Spalte ${i + 1}`, samples, filled, emailLike})
    }
    return cols.filter(c => c.filled > 0 || (header[c.index] !== null && header[c.index] !== undefined))
}

const detectEmailColumn = (cols) => {
    const byName = cols.find(c => /e-?mail/i.test(c.name) && c.emailLike > 0)
    if (byName) return byName.index
    const best = [...cols].sort((a, b) => b.emailLike - a.emailLike)[0]
    return best && best.emailLike > 0 ? best.index : null
}

/**
 * Step 1: read the file and tell the client which columns exist.
 */
export const analyzeSubscriberFile = async ({data, sheet, headerRow}) => {
    const buffer = Buffer.from(data, 'base64')
    const {XLSX, wb} = await readWorkbook(buffer)
    const sheets = wb.SheetNames
    const sheetName = sheet && sheets.includes(sheet) ? sheet : sheets[0]
    const rows = sheetRows(XLSX, wb.Sheets[sheetName])
    const header = headerRow && headerRow > 0 ? headerRow : detectHeaderRow(rows)
    const columns = columnsOf(rows, header)
    return {
        sheets,
        sheet: sheetName,
        headerRow: header,
        rowCount: Math.max(0, rows.length - header),
        emailColumn: detectEmailColumn(columns),
        columns: columns.map(({index, name, samples, filled}) => ({index, name, samples, filled}))
    }
}

const isEmptyMetaValue = v => v === null || v === undefined || v === ''

const buildRows = (rows, {headerRow, emailColumn, metaMapping, fixedMeta}) => {
    const result = {entries: new Map(), invalid: 0, empty: 0, duplicates: 0, invalidExamples: []}
    for (let i = headerRow; i < rows.length; i++) {
        const row = rows[i]
        const raw = row[emailColumn]
        if (raw === null || raw === undefined) {
            // completely empty rows are ignored silently
            if (row.some(c => c !== null)) result.empty++
            continue
        }
        const email = normalizeEmail(raw)
        if (!email) {
            result.invalid++
            if (result.invalidExamples.length < 10) result.invalidExamples.push(String(raw))
            continue
        }
        const meta = {}
        metaMapping.forEach(({column, key}) => {
            const v = row[column]
            if (!isEmptyMetaValue(v)) meta[key] = v
        })
        const existing = result.entries.get(email)
        if (existing) {
            // same address twice in the file: the first value of a key wins
            result.duplicates++
            Object.keys(meta).forEach(k => {
                if (existing.meta[k] === undefined) existing.meta[k] = meta[k]
            })
        } else {
            result.entries.set(email, {email, meta: {...fixedMeta, ...meta}})
        }
    }
    return result
}

const isPlainObject = o => o && typeof o === 'object' && o.constructor === Object

/**
 * Step 2: import.
 * - unknown address -> created with state/confirmed/language of the options
 * - known address -> the lists are added (always); state, confirmed, language and meta are only changed with overwrite
 *   (without overwrite only meta keys that do not exist yet are added)
 */
export const importSubscribers = async ({db, data, sheet, headerRow, emailColumn, metaMapping = [], fixedMeta, lists = [], overwrite = false,
                                            keepUnsubscribed = true, state = 'subscribed', confirmed = true, language, dryRun = false}) => {
    const buffer = Buffer.from(data, 'base64')
    const {XLSX, wb} = await readWorkbook(buffer)
    const sheetName = sheet && wb.SheetNames.includes(sheet) ? sheet : wb.SheetNames[0]
    const rows = sheetRows(XLSX, wb.Sheets[sheetName])

    if (!(headerRow > 0)) throw new Error('Ungültige Kopfzeile')
    if (!(emailColumn >= 0)) throw new Error('Keine Spalte mit der E-Mail Adresse gewählt')

    const cleanMapping = (metaMapping || []).filter(m => m && m.column >= 0 && m.key && String(m.key).trim()).map(m => ({
        column: m.column, key: String(m.key).trim()
    }))
    let fixed = {}
    if (fixedMeta) {
        fixed = typeof fixedMeta === 'string' ? JSON.parse(fixedMeta) : fixedMeta
        if (!isPlainObject(fixed)) throw new Error('Feste Meta-Werte müssen ein JSON-Objekt sein')
    }

    const listIds = (lists || []).filter(Boolean).map(id => new ObjectId(id))
    const built = buildRows(rows, {headerRow, emailColumn, metaMapping: cleanMapping, fixedMeta: fixed})
    const entries = [...built.entries.values()]

    const stats = {
        total: entries.length,
        created: 0,
        updated: 0,
        unchanged: 0,
        skippedUnsubscribed: 0,
        invalid: built.invalid,
        empty: built.empty,
        duplicates: built.duplicates,
        invalidExamples: built.invalidExamples,
        dryRun: !!dryRun
    }

    const collection = db.collection('NewsletterSubscriber')
    const CHUNK = 500
    for (let start = 0; start < entries.length; start += CHUNK) {
        const chunk = entries.slice(start, start + CHUNK)
        // addresses are stored in lower case, older entries may differ -> case insensitive lookup
        const found = await collection.find({email: {$in: chunk.map(e => e.email)}}, {collation: {locale: 'en', strength: 2}}).toArray()
        const byEmail = new Map()
        found.forEach(doc => {
            const k = String(doc.email).toLowerCase()
            if (!byEmail.has(k)) byEmail.set(k, [])
            byEmail.get(k).push(doc)
        })

        const ops = []
        for (const entry of chunk) {
            const docs = byEmail.get(entry.email)
            if (!docs) {
                stats.created++
                const doc = {email: entry.email, state, confirmed: !!confirmed, list: listIds}
                if (language) doc.language = language
                if (Object.keys(entry.meta).length) doc.meta = entry.meta
                ops.push({insertOne: {document: doc}})
                continue
            }
            let changed = false
            for (const doc of docs) {
                const $set = {}
                const existingList = (doc.list || []).map(String)
                const missingLists = listIds.filter(id => !existingList.includes(String(id)))

                const protectedByUnsub = overwrite && keepUnsubscribed && doc.state === 'unsubscribed'
                if (protectedByUnsub) stats.skippedUnsubscribed++

                if (overwrite && !protectedByUnsub) {
                    if (doc.state !== state) $set.state = state
                    if (!!doc.confirmed !== !!confirmed) $set.confirmed = !!confirmed
                    if (language && doc.language !== language) $set.language = language
                }
                // meta: overwrite replaces the mapped keys, otherwise only missing keys are added. Other keys stay.
                const oldMeta = isPlainObject(doc.meta) ? doc.meta : {}
                const newMeta = {...oldMeta}
                Object.keys(entry.meta).forEach(k => {
                    if (overwrite ? JSON.stringify(oldMeta[k]) !== JSON.stringify(entry.meta[k]) : oldMeta[k] === undefined) {
                        newMeta[k] = entry.meta[k]
                    }
                })
                if (Object.keys(newMeta).length !== Object.keys(oldMeta).length || Object.keys(newMeta).some(k => JSON.stringify(newMeta[k]) !== JSON.stringify(oldMeta[k]))) {
                    $set.meta = newMeta
                }

                const update = {}
                if (Object.keys($set).length) update.$set = $set
                if (missingLists.length) update.$addToSet = {list: {$each: missingLists}}
                if (Object.keys(update).length) {
                    changed = true
                    ops.push({updateOne: {filter: {_id: doc._id}, update}})
                }
            }
            if (changed) stats.updated++
            else stats.unchanged++
        }
        if (!dryRun && ops.length) {
            await collection.bulkWrite(ops, {ordered: false})
        }
    }
    return stats
}

/**
 * Removes the addresses of the file from the given lists (the subscribers themselves are kept).
 */
export const removeSubscribersFromLists = async ({db, data, sheet, headerRow, emailColumn, lists = [], dryRun = false}) => {
    const buffer = Buffer.from(data, 'base64')
    const {XLSX, wb} = await readWorkbook(buffer)
    const sheetName = sheet && wb.SheetNames.includes(sheet) ? sheet : wb.SheetNames[0]
    const rows = sheetRows(XLSX, wb.Sheets[sheetName])

    if (!(headerRow > 0)) throw new Error('Ungültige Kopfzeile')
    if (!(emailColumn >= 0)) throw new Error('Keine Spalte mit der E-Mail Adresse gewählt')
    const listIds = (lists || []).filter(Boolean).map(id => new ObjectId(id))
    if (!listIds.length) throw new Error('Keine Liste gewählt')
    const listStrings = listIds.map(String)

    const built = buildRows(rows, {headerRow, emailColumn, metaMapping: [], fixedMeta: {}})
    const emails = [...built.entries.keys()]

    const stats = {
        total: emails.length,
        removed: 0,
        notInList: 0,
        notFound: 0,
        invalid: built.invalid,
        empty: built.empty,
        duplicates: built.duplicates,
        invalidExamples: built.invalidExamples,
        dryRun: !!dryRun
    }

    const collection = db.collection('NewsletterSubscriber')
    const CHUNK = 500
    for (let start = 0; start < emails.length; start += CHUNK) {
        const chunk = emails.slice(start, start + CHUNK)
        const found = await collection.find({email: {$in: chunk}}, {collation: {locale: 'en', strength: 2}}).toArray()
        const foundEmails = new Set(found.map(d => String(d.email).toLowerCase()))
        stats.notFound += chunk.filter(e => !foundEmails.has(e)).length

        const ids = []
        const countedEmails = new Set()
        found.forEach(doc => {
            const inList = (doc.list || []).some(id => listStrings.includes(String(id)))
            const key = String(doc.email).toLowerCase()
            if (inList) {
                ids.push(doc._id)
                if (!countedEmails.has(key)) {
                    countedEmails.add(key)
                    stats.removed++
                }
            }
        })
        found.forEach(doc => {
            const key = String(doc.email).toLowerCase()
            if (!countedEmails.has(key)) {
                countedEmails.add(key)
                stats.notInList++
            }
        })
        if (!dryRun && ids.length) {
            await collection.updateMany({_id: {$in: ids}}, {$pull: {list: {$in: listIds}}})
        }
    }
    return stats
}
