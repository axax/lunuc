export const performFieldProjection = (projection, data)=>{
    if(!data){
        return
    }
    let newData
    if(Array.isArray(data)){
        newData = []
    }else{
        newData = {}
    }
    for (const project of projection) {
        if(project.constructor===Object){
            const key = Object.keys(project)[0]
            newData[key] = performFieldProjection(project[key], data[key])
        }else {
            if(Array.isArray(data)){
                data.forEach((d,i)=>{
                    if(newData.length-1<i){
                        newData.push({})
                    }
                    newData[i][project] = d[project]

                })
            }else {
                const dotIndex = project.indexOf('.')

                if(dotIndex>=0){
                    const newKey = project.substring(0,dotIndex)
                    newData[newKey] = performFieldProjection([project.substring(dotIndex+1)], data[newKey])
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
                queryString += field.substring(0,dotIndex)
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
