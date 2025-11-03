import {getType} from '../../../util/types.mjs'
import {ObjectId} from 'mongodb'
import {getFieldsFromGraphqlInfoSelectionSet} from '../../util/graphql.js'
import {replacePlaceholders} from "../../../util/placeholders.mjs";
import {isString, parseOrElse, propertyByPath} from '../../../client/util/json.mjs'

export const resolveDynamicFieldQuery = async (db, field, item, setItem) => {
    const dyn = field.dynamic
    if (dyn.action === 'count') {
        const query = Object.assign({}, dyn.query)
        if (query) {
            Object.keys(query).forEach(k => {
                if(isString(query[k])){
                    if (query[k] === '_id') {
                        query[k] = item._id
                    }  else if(query[k].startsWith('${')){
                        query[k] = replacePlaceholders(query[k],item)

                        console.log( query[k],item)
                        if(!isNaN(query[k])){
                            query[k] = {$in:[query[k],parseInt(query[k])]}
                        }
                    }
                }else if (query[k].$in && query[k].$in[0] === '_id') {
                    query[k] = Object.assign({}, query[k])
                    query[k].$in = [...query[k].$in]
                    query[k].$in[0] = item._id
                }
            })
        }
        //let d = new Date().getTime()
        setItem[field.name] = await db.collection(dyn.type).count(query)
        //console.log(`time ${new Date().getTime()-d}ms`)
    }else if(dyn.action==='alias'){
        const aliasField = dyn.path.split('.')[0]
        if(item[aliasField]){
            const json = parseOrElse(item[aliasField],{})
            setItem[field.name] = propertyByPath(dyn.path,{[aliasField]:json})
            if(setItem[field.name] && setItem[field.name].constructor !== String){
                setItem[field.name] = JSON.stringify(setItem[field.name])
            }
        }
    }
}

export default async function (response, {typeName, db, graphqlInfo}){

    // here is a good place to handle: Cannot return null for non-nullable
    const repairMode = true
    if (response.results) {
        const typeDefinition = getType(typeName) || {}
        if (typeDefinition.fields) {
            let hasField = false

            for (let i = 0; i < response.results.length; i++) {
                const item = response.results[i]

                if (item.createdBy === null) {
                    item.createdBy = {_id: 0, username: 'null reference'}
                }else if(item.createdBy && item.createdBy.constructor === ObjectId){
                    item.createdBy = {_id: item.createdBy, username: 'not resolved'}
                }

                for (let y = 0; y < typeDefinition.fields.length; y++) {
                    const field = typeDefinition.fields[y]
                    // convert type Object to String
                    // item[field.name] = JSON.stringify(item[field.name])
                    if (field) {


                        if (field.reference) {
                            const refTypeDefinition = getType(field.type) || {}

                            if(!field.localized) {
                                for (let z = 0; z < refTypeDefinition.fields.length; z++) {
                                    const refField = refTypeDefinition.fields[z]
                                    if (refField) {
                                        if (refField.type === 'Object' && item[field.name]) {

                                            let itemValueAsArray = item[field.name]

                                            if (!Array.isArray(itemValueAsArray)) {
                                                itemValueAsArray = [itemValueAsArray]
                                            }
                                            const newitemValueAsArray = []

                                            itemValueAsArray.forEach(itemValue => {
                                                if (itemValue && itemValue[refField.name] && (itemValue[refField.name].constructor === Object || itemValue[refField.name].constructor === Array)) {
                                                    itemValue[refField.name] = JSON.stringify(itemValue[refField.name])
                                                }
                                                newitemValueAsArray.push(itemValue)
                                            })

                                            if (field.multi) {
                                                item[field.name] = newitemValueAsArray
                                            } else {
                                                item[field.name] = newitemValueAsArray.length > 0 ? newitemValueAsArray[0] : ''
                                            }
                                            //console.log(`convert ${typeName}.${field.name}.${refField.name} to string`)
                                        }
                                    }
                                }
                            }
                        }else if(field.type==='Float'){
                            if (isNaN(item[field.name])) {
                                item[field.name] = 0
                            }
                        }else if (field.type === 'Object') {
                            hasField = true
                            // TODO: with mongodb 4 this can be removed as convert and toString is supported
                            if (item[field.name] && (item[field.name].constructor === Object || item[field.name].constructor === Array)) {
                                //console.log(`convert ${typeName}.${field.name} to string`)
                                item[field.name] = JSON.stringify(item[field.name])
                            }
                        }else if(field.type==='String' || (!field.type && !field.enum && !field.localized)){
                            if (item[field.name] && item[field.name].constructor !== String) {
                                //console.log(`convert ${typeName}.${field.name} to string`)
                                item[field.name] = JSON.stringify(item[field.name])
                            }
                        }

                        if(field.required && item[field.name]===null){
                            // prevent ERROR: Cannot return null for non-nullable field UserSetting.name.
                            item[field.name] = ''
                        }

                        if (field.dynamic) {

                            if(graphqlInfo && graphqlInfo.fieldNodes && graphqlInfo.fieldNodes.length>0) {

                                // is field requested
                                const fields = getFieldsFromGraphqlInfoSelectionSet(graphqlInfo.fieldNodes[0].selectionSet.selections)
                                if(!fields || !fields.results || !fields.results[field.name]){
                                    console.log(`dynamic field ${field.name} is not calculated as it is not requested`)
                                    continue
                                }
                            }

                            hasField = true
                            await resolveDynamicFieldQuery(db, field, item, item)
                        }
                    }


                    // in case a field changed to localized
                    /*if( field.localized ){
                     hasField = true
                     if (item[field.name].constructor !== Object) {
                     const translations = {}
                     config.LANGUAGES.forEach(lang => {
                     translations[lang] = item[field.name]
                     })
                     item[field.name] = translations
                     }
                     }*/
                }


                if (!repairMode && !hasField) {
                    break
                }
            }
        }
    }
    return response
}