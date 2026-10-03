/**
 * Baseline for "import only what has changed".
 *
 * Every export writes <dir>/.export-state.json with a hash per entry and field of the value
 * that was written. An import compares three values per field:
 *
 *   file   - the value in the file now
 *   db     - the value in the database now
 *   base   - the value at the time of the last export (or import)
 *
 *   file == db             -> nothing to do
 *   file == base           -> the file was not touched, the db is newer -> keep the db
 *   file != base, db == base -> only the file was changed -> import
 *   file != base, db != base -> both were changed -> conflict, nothing is written
 *
 * So an import never overwrites a change that was made in the admin after the export.
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

export const EXPORT_STATE_FILE = '.export-state.json'
const STATE_VERSION = 1

export const hashString = (str) => crypto.createHash('sha1').update(str, 'utf8').digest('hex')

/**
 * @param isCode code fields are stored as text, null and '' are the same
 */
export const normalizeValue = (value, isCode) => {
    if (isCode) {
        if (value === null || value === undefined) {
            return ''
        }
        return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
    }
    return JSON.stringify(value === undefined ? null : value)
}

export const hashValue = (value, isCode) => hashString(normalizeValue(value, isCode))

export const readExportState = (root) => {
    const file = path.join(root, EXPORT_STATE_FILE)
    try {
        if (fs.existsSync(file)) {
            const state = JSON.parse(fs.readFileSync(file, 'utf8'))
            if (state && state.items) {
                return state
            }
        }
    } catch (e) {
        console.warn(`invalid ${file}: ${e.message}`)
    }
    return {version: STATE_VERSION, items: {}}
}

export const writeExportState = (root, state) => {
    fs.mkdirSync(root, {recursive: true})
    state.version = STATE_VERSION
    state.updatedAt = new Date().toISOString()
    fs.writeFileSync(path.join(root, EXPORT_STATE_FILE), JSON.stringify(state, null, 1) + '\n', 'utf8')
}

/**
 * hashes of all fields of an entry
 * @param values {field: value} - plain json values (ids as {$oid}), code fields as text
 */
export const hashFields = (values, codeFields = []) => {
    const hashes = {}
    Object.keys(values).forEach(field => {
        hashes[field] = hashValue(values[field], codeFields.indexOf(field) >= 0)
    })
    return hashes
}

/**
 * @param fileValues {field: value} from the files
 * @param dbValues {field: value} current values in the db (plain json, code fields as text)
 * @param base {field: hash} from the export state
 * @returns {changed: {field: value}, conflicts: [field], unchanged: [field], base: {field: hash}}
 *          base is the new baseline for the fields that are equal now
 */
export const threeWayDiff = ({fileValues, dbValues, base, codeFields = []}) => {
    const changed = {}, conflicts = [], newBase = {...base}
    Object.keys(fileValues).forEach(field => {
        const isCode = codeFields.indexOf(field) >= 0
        const fileHash = hashValue(fileValues[field], isCode)
        const dbHash = hashValue(dbValues[field], isCode)
        // a field without baseline did not exist at export time
        const baseHash = base[field] !== undefined ? base[field] : hashValue(null, isCode)

        if (fileHash === dbHash) {
            newBase[field] = fileHash
        } else if (fileHash === baseHash) {
            // file untouched, db changed later -> keep db
        } else if (dbHash === baseHash) {
            changed[field] = fileValues[field]
            newBase[field] = fileHash
        } else {
            conflicts.push(field)
        }
    })
    return {changed, conflicts, base: newBase}
}
