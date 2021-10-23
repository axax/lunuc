export const projectFields = (projection, data, newData)=>{
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
            newData[key] = projectFields(project[key], data[key])
        }else {
            if(data.constructor===Array){
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
