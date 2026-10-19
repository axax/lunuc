/*
 * Helpers for excel files (Media) shown through the api system/excel2html.
 * Used by the admin form fields (components/ExcelFields.js) and the cms component ExcelTable.
 */

export const EXCEL_API = '/lunucapi/system/excel2html'

const CACHE_TTL = 30 * 1000
const requestCache = {}

export const fetchExcelJson = url => {
    const cached = requestCache[url]
    if (cached && cached.time > Date.now() - CACHE_TTL) {
        return cached.promise
    }
    const promise = fetch(url, {credentials: 'same-origin'})
        .then(res => res.json())
        .then(json => {
            if (json.error) {
                throw new Error(json.error)
            }
            return json
        })
        .catch(e => {
            delete requestCache[url]
            throw e
        })
    requestCache[url] = {promise, time: Date.now()}
    return promise
}

export const excelApiUrl = params => EXCEL_API + '?' + Object.keys(params)
    .filter(k => params[k] !== '' && params[k] !== undefined && params[k] !== null)
    .map(k => k + '=' + encodeURIComponent(params[k])).join('&')

// value of a Media field: id string, json string, object or array of objects
export const mediaIdFromValue = value => {
    if (!value) return ''
    if (typeof value === 'string') {
        const str = value.trim()
        if (/^[a-f0-9]{24}$/i.test(str)) return str
        if (str.startsWith('{') || str.startsWith('[')) {
            try {
                return mediaIdFromValue(JSON.parse(str))
            } catch (e) {
                return ''
            }
        }
        return ''
    }
    if (Array.isArray(value)) return mediaIdFromValue(value[0])
    return value._id ? String(value._id) : ''
}

export const colLetters = nr => {
    let s = ''
    while (nr > 0) {
        const m = (nr - 1) % 26
        s = String.fromCharCode(65 + m) + s
        nr = Math.floor((nr - 1) / 26)
    }
    return s
}

const colNumber = letters => letters.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0)

export const parseRange = range => {
    const m = String(range || '').trim().toUpperCase().match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/)
    if (!m) return null
    const a = {c: colNumber(m[1]), r: parseInt(m[2])}, b = {c: colNumber(m[3]), r: parseInt(m[4])}
    return {top: Math.min(a.r, b.r), bottom: Math.max(a.r, b.r), left: Math.min(a.c, b.c), right: Math.max(a.c, b.c)}
}

export const parseHeaderRows = value => value === undefined || value === null || value === '' ? 1 : (parseInt(value) || 0)

/*
 * «gestufter Ausweis»: only the sum rows (the last one highlighted) and one header row
 * (the header rows are merged per column, the first column gets the text of a leading section row, e.g. «in CHF»).
 * Same logic as the page digithal/element/jahresbericht/bereich.
 * data = response of format=data: {header: [[cell]], rows: [{cells, sum, section}]}
 */
export const sumRowsOnly = data => {
    if (!data || !data.rows || data.rows.length === 0) {
        return data
    }
    const section = data.rows.find(r => r.section && r.cells && r.cells[0] && r.cells[0].v)
    const sums = data.rows.filter(r => r.sum)
    const rows = sums.map((r, i) => Object.assign({}, r, {sum: i === sums.length - 1, section: false}))
    let header = data.header || []
    if (header.length > 0) {
        const columns = []
        header.forEach(cellsOfRow => {
            let col = 0
            cellsOfRow.forEach(h => {
                while (columns[col] && columns[col].rowspanLeft > 0) {
                    columns[col].rowspanLeft--
                    col++
                }
                const span = parseInt(h.span) || 1
                if (!columns[col]) {
                    columns[col] = {v: '', n: h.n, span, rowspanLeft: 0}
                }
                if (h.v) {
                    columns[col].v = columns[col].v ? columns[col].v + ' ' + h.v : h.v
                }
                columns[col].n = columns[col].n || h.n
                columns[col].rowspanLeft = (parseInt(h.rowspan) || 1) - 1
                col += span
            })
        })
        const cells = columns.filter(Boolean).map(c => ({v: c.v, n: c.n, span: c.span > 1 ? c.span : undefined}))
        if (cells[0] && section) {
            cells[0] = Object.assign({}, cells[0], {v: section.cells[0].v, n: false})
        }
        header = [cells]
    }
    return Object.assign({}, data, {header, rows})
}
