import Util from '../client/util/index.mjs'

const json2csv =(items, seperator=';')=>{

    const replacer = (key, value) => {
        if(value === null || value===undefined ){
            return ''
        }
        if( value.constructor === Date){
            return Util.formatDate(value)
        }
        if(value.replace) {
            return value.replace(seperator, '')
        }
        return value
    } // specify how you want to handle null values here
    const header = Object.keys(items[0])
    let csv = items.map(row => header.map(fieldName => JSON.stringify(row[fieldName], replacer)).join(seperator))
    csv.unshift(header.join(seperator))
    csv = csv.join('\r\n')

    return csv
}

export default json2csv
