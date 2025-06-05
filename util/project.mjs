import {deepMergeOptional} from './deepMerge.mjs'
import {getFieldOfType} from "./types.mjs";
import config from '../gensrc/config.mjs'

const toObject = (any) => {
    if(any && any.constructor === String){
        try{
            return JSON.parse(any)
        }catch (e){}
    }
    return any
}
export const performFieldProjection = (projection, data, level = 0)=>{
    if(!data){
        return
    }
    let newData
    if(Array.isArray(data) && level === 0){
        newData = []
        data.forEach((d, i) => {
            if (newData.length - 1 < i) {
                newData.push({})
            }
            newData[i] = performFieldProjection(projection, d, level+1)
        })
    }else{
        newData = {}

        for (const project of projection) {
            if(project.constructor===Object){
                const key = Object.keys(project)[0]
                newData[key] = performFieldProjection(project[key], toObject(data[key]), level+1)
            }else {
                const dotIndex = project.indexOf('.')
                if(dotIndex>=0){
                    const newKey = project.substring(0,dotIndex)
                    const tmp = performFieldProjection([project.substring(dotIndex+1)], data[newKey], level+1)
                    if(newData[newKey]){
                        newData[newKey] = deepMergeOptional({mergeArray:true, concatArrays: false}, newData[newKey] , tmp)
                    }else {
                        newData[newKey] = tmp
                    }
                }else {
                    newData[project] = data[project]
                }
            }
        }
    }
    return newData
}


export const findProjection = (key, projection) => {
    if(projection) {
        for (let i = 0; i < projection.length; i++) {
            const pro = projection[i]
            if (pro) {
                if (pro.constructor === Object) {

                    if (Object.keys(pro)[0] === key) {
                        return {index: i, data: pro[key]}
                    }
                } else if (pro === key) {
                    return {index: i, data: key}
                }
            }
        }
    }
    return {}
}

export const projectionToQueryString = (projection, type) => {
    let queryString = '{_id __typename'

    projection.forEach(field => {
        if (queryString != '') {
            queryString += ' '
        }
        if (field.constructor === String) {
            const dotIndex = field.indexOf('.')
            if(dotIndex>=0){
                const parts = field.split('.')
                const fieldDefinition = getFieldOfType(type, parts[0])
                if(fieldDefinition && fieldDefinition.localized){
                    queryString += `${parts[0]}{${config.LANGUAGES.join(' ')}}`
                }else {
                    queryString += parts[0]
                }

            }else {
                queryString += field
            }
        } else {
            Object.keys(field).forEach(key => {
                queryString += key + '{'
                field[key].forEach(name => {
                    queryString += name + ' '
                })
                queryString += '}'
            })
        }
    })
    queryString += '}'
    return queryString
}
