export const performFieldProjection = (projection, data, newData)=>{
    if(!data){
        return
    }
    if(data.constructor===Array){
        newData = []
    }else{
        newData = {}
    }
    for (const project of projection) {
        if(project.constructor===Object){
            const key = Object.keys(project)[0]
            newData[key] = performFieldProjection(project[key], data[key])
        }else {
            if(data.constructor===Array && data.forEach){
                data.forEach((d,i)=>{
                    if(newData.length-1<i){
                        newData.push({})
                    }
                    newData[i][project] = d[project]

                })
            }else {
                newData[project] = data[project]
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
                    return pro[key]
                }
            }else if(pro===key){
                return key
            }
        }
    }
}

export const projectionToQueryString = (projection) => {
    let queryString = ''

    projection.forEach(field => {
        if (queryString != '') {
            queryString += ' '
        }
        if (field.constructor === String) {
            queryString += field
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
