const json2csv =(items, seperator=';')=>{

    const replacer = (key, value) => value === null || value===undefined || !value.replace? '' : value.replace(seperator,'') // specify how you want to handle null values here
    const header = Object.keys(items[0])
    let csv = items.map(row => header.map(fieldName => JSON.stringify(row[fieldName], replacer)).join(seperator))
    csv.unshift(header.join(seperator))
    csv = csv.join('\r\n')

    return csv
}

export default json2csv
