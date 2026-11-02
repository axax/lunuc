/*
 CSV for client and server, the one place for csv in lunuc
 RFC 4180: cells with separator, quote or line break are quoted, quotes are doubled

 toCsv          objects -> csv text (export of the type list, GenericData, util/json2csv.js)
 parseCsv       csv text -> rows (arrays of cells)
 csvToObjects   csv text with a header line -> {columns, rows, items, separator} (import of the type list)
 csvToJson      api of the former client/util/csv.mjs (keys in camelCase, e.g. "First Name" -> firstName)
 csv2json       api of the former api/util/csv.mjs (rows with an empty first cell are skipped, id is added)
 */

const SEPARATORS = [';', '\t', ',']
const NEEDS_QUOTES = /["\r\n]/
const BOM = /^﻿/

const quoteCell = (value, separator, quoteAll) =>
    quoteAll || value.indexOf(separator) >= 0 || NEEDS_QUOTES.test(value)
        ? '"' + value.replace(/"/g, '""') + '"'
        : value

/**
 * @param items array of objects
 * @param separator default ; (Excel in German locales)
 * @param header column order, default: the keys of all items in the order they appear
 * @param quoteAll quote every cell (e.g. for tools that expect it)
 * @param formatValue optional (value, key) => value before the conversion to text
 */
export const toCsv = (items, {separator = ';', header, quoteAll = false, formatValue} = {}) => {
    if (!items || items.length === 0) {
        return header ? header.map(key => quoteCell(String(key), separator, quoteAll)).join(separator) : ''
    }
    if (!header) {
        const seen = new Set()
        header = []
        items.forEach(item => Object.keys(item).forEach(key => {
            if (!seen.has(key)) {
                seen.add(key)
                header.push(key)
            }
        }))
    }
    const cell = (value, key) => {
        if (formatValue) {
            value = formatValue(value, key)
        }
        if (value === null || value === undefined) {
            value = ''
        } else if (value.constructor === Date) {
            value = value.toISOString()
        } else if (typeof value === 'object') {
            value = JSON.stringify(value)
        } else {
            value = String(value)
        }
        return quoteCell(value, separator, quoteAll)
    }
    const rows = items.map(row => header.map(key => cell(row[key], key)).join(separator))
    rows.unshift(header.map(key => quoteCell(String(key), separator, quoteAll)).join(separator))
    return rows.join('\r\n')
}

/**
 * rows (arrays of cells) of a csv text, empty lines are skipped
 * cells are taken as slices of the text (not char by char) for big files
 */
export const parseCsv = (text, separator = ';') => {
    const rows = [], len = text.length, sep = separator.charCodeAt(0)
    let row = [], cell = '', start = 0, i = 0, quoted = false
    while (i < len) {
        if (quoted) {
            const q = text.indexOf('"', i)
            if (q < 0) {
                // quote not closed: rest of the text
                cell += text.slice(i)
                i = start = len
            } else if (text.charCodeAt(q + 1) === 34) {
                // "" inside quotes
                cell += text.slice(i, q + 1)
                i = start = q + 2
            } else {
                cell += text.slice(i, q)
                quoted = false
                i = start = q + 1
            }
            continue
        }
        const c = text.charCodeAt(i)
        if (c === 34) {
            cell += text.slice(start, i)
            quoted = true
            start = ++i
        } else if (c === sep) {
            row.push(cell + text.slice(start, i))
            cell = ''
            start = ++i
        } else if (c === 10 || c === 13) {
            row.push(cell + text.slice(start, i))
            rows.push(row)
            row = []
            cell = ''
            i += c === 13 && text.charCodeAt(i + 1) === 10 ? 2 : 1
            start = i
        } else {
            i++
        }
    }
    cell += text.slice(start, len)
    if (cell || row.length) {
        row.push(cell)
        rows.push(row)
    }
    return rows.filter(r => r.length > 1 || r[0])
}

/** the separator that gives the most columns in the header line (only the first line is parsed) */
export const detectCsvSeparator = (text) => {
    const firstLine = text.split(/\r?\n/, 1)[0] || ''
    let best = SEPARATORS[0], bestCount = -1
    SEPARATORS.forEach(separator => {
        const count = parseCsv(firstLine, separator)[0]?.length || 0
        if (count > bestCount) {
            best = separator
            bestCount = count
        }
    })
    return best
}

/**
 * csv text with a header line to objects
 * @param options separator (string) or {separator, columnName: name => key}
 *        without a separator it is detected (; tab or ,)
 * @returns {columns, rows (arrays), items (objects), separator}
 */
export const csvToObjects = (text, options) => {
    let {separator, columnName} = typeof options === 'string' ? {separator: options} : (options || {})
    text = (text || '').replace(BOM, '')
    separator = separator || detectCsvSeparator(text)
    const rows = parseCsv(text, separator)
    if (rows.length === 0) {
        return {columns: [], rows: [], items: [], separator}
    }
    const columns = rows[0].map(c => columnName ? columnName(c.trim()) : c.trim())
    const data = rows.slice(1)
    const items = data.map(row => {
        const item = {}
        for (let i = 0; i < columns.length; i++) {
            if (columns[i]) {
                item[columns[i]] = row[i] !== undefined ? row[i] : ''
            }
        }
        return item
    })
    return {columns, rows: data, items, separator}
}

const camelCaseKey = name => {
    name = name.replace(/\s/g, '')
    return name.charAt(0).toLowerCase() + name.substring(1)
}

/** csv to objects with keys in camelCase ("First Name" -> firstName), separator default ; */
export const csvToJson = (text, separator) =>
    csvToObjects(text, {separator: separator || ';', columnName: camelCaseKey}).items

/** csv to objects, rows with an empty first cell are skipped, entries without id get their index as id */
export const csv2json = (text, separator) => {
    const {rows, items} = csvToObjects(text, separator || ';')
    const result = []
    for (let i = 0; i < items.length; i++) {
        if (rows[i][0]) {
            const item = items[i]
            if (!item.id) {
                item.id = result.length
            }
            result.push(item)
        }
    }
    return result
}
