import {deepMergeOptional} from './deepMerge.mjs'

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
                newData[key] = performFieldProjection(project[key], data[key], level+1)
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
    for (let i = 0; i < projection.length; i++) {
        const pro = projection[i]
        if (pro) {
            if (pro.constructor === Object) {

                if (Object.keys(pro)[0] === key) {
                    return {index:i, data:pro[key]}
                }
            }else if(pro===key){
                return {index:i, data:key}
            }
        }
    }
    return {}
}

export const projectionToQueryString = (projection) => {
    let queryString = ''

    projection.forEach(field => {
        if (queryString != '') {
            queryString += ' '
        }
        if (field.constructor === String) {
            const dotIndex = field.indexOf('.')
            if(dotIndex>=0){
                const parts = field.split('.')
                let tmpStr = ''
                for(let i = parts.length-1;i>=0;i--){
                    tmpStr = `{${parts[i]}${tmpStr}}`
                }
                queryString += tmpStr.substring(1,tmpStr.length-1)
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
    return queryString
}
