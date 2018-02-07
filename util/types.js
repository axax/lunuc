import extensions from 'gen/extensions'
import Hook from 'util/hook'

const types = {}, typeQueries = {}, typeFormFields = {}


export const getTypes = () => {

    if( Object.keys(types).length === 0 ) {

        //  create types object only once
        for (const extensionName in extensions) {
            const extension = extensions[extensionName]
            if (extension.options && extension.options.types) {

                extension.options.types.forEach(type => {

                    types[type.name] = Object.assign({}, type)

                    // add extension name so we know by which extension the type is used
                    if (!types[type.name].usedBy) {
                        types[type.name].usedBy = []
                    }
                    types[type.name].usedBy.push(extensionName)
                })

            }
        }
        Hook.call('Types', {types})
    }

    return types
}

export const getType = (typeName) =>{
    // todo: optimise so that not all types need to be loaded
    const types = getTypes()
    return types[typeName]
}

export const getTypeQueries = (typeName) => {

    if( typeQueries[typeName] ) return typeQueries[typeName]

    const types = getTypes()

    if (!typeName || !types[typeName]) return null

    const result = {}

    const {name, fields} = types[typeName]
    const nameStartLower = name.charAt(0).toLowerCase() + name.slice(1)

    let query = '_id status createdBy{_id username}'
    let queryMutation = '_id status'

    let insertParams = '', insertUpdateQuery = '', updateParams = ''


    if (fields) {
        fields.map(({name, type, required, multi, reference}) => {
            if (insertParams !== '') {
                insertParams += ', '
                updateParams += ', '
                insertUpdateQuery += ', '
            }

            let t = type || 'String'

            if (reference) {
                t = (multi ? '[' : '') + 'ID' + (multi ? ']' : '')

                // todo: field name might be different than name
                query += ' ' + name + '{_id name}'
            } else {
                query += ' ' + name
            }

            insertParams += '$' + name + ': ' + t + (required ? '!' : '')
            updateParams += '$' + name + ': ' + t
            insertUpdateQuery += name + ': ' + '$' + name
        })
    }
    result.query = `query ${nameStartLower}s($sort: String,$limit: Int,$page: Int,$filter: String){
                ${nameStartLower}s(sort:$sort, limit: $limit, page:$page, filter:$filter){limit offset total results{${query}}}}`



    result.create = `mutation create${name}(${insertParams}){create${name}(${insertUpdateQuery}){${queryMutation}}}`
    result.update = `mutation update${name}($_id: ID!,${updateParams}){update${name}(_id:$_id,${insertUpdateQuery}){${queryMutation}}}`
    result.delete = `mutation delete${name}($_id: ID!){delete${name}(_id: $_id){${queryMutation}}}`

    typeQueries[typeName] = result
    return result
}



export const getFormFields = (type)=> {
    if (typeFormFields[type]) return typeFormFields[type]
    const types = getTypes()

    typeFormFields[type] = {}
    types[type].fields.map(field => {
        let uitype = field.uitype, placeholder = ''
        // if uitype is not defined and if it is a reference to another type use type_picker
        if (!uitype && field.reference) {
            uitype = 'type_picker'
            placeholder = `${field.name} -> ${field.type}`
        } else {
            placeholder = `Enter ${field.name}`
        }
        typeFormFields[type][field.name] = {
            placeholder,
            uitype,
            multi: !!field.multi,
            type: field.type
        }
    })

    return typeFormFields[type]
}