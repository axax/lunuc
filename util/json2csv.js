import {toCsv} from './csv.mjs'

/*
 kept for scripts in the database (require('@util/json2csv'), e.g. api system/generictype2csv)
 columns: keys of the first item, dates as ISO string (as before: JSON.stringify called toJSON)
 */
const json2csv = (items, separator = ';') => {
    if (!items || items.length === 0) {
        return ''
    }
    return toCsv(items, {separator, header: Object.keys(items[0])})
}

export default json2csv
