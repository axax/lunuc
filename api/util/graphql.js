
export const hasQueryField = (fieldNodes, path)=> {
    if(!path){
        return true
    }

    if(fieldNodes.constructor===Array){
        for(let i = 0;i < fieldNodes.length;i++){
            const field = fieldNodes[i]
            if(path===field.name.value) {
                return true
            }else if(path.startsWith(field.name.value+'.')){
                return hasQueryField(field.selectionSet.selections, path.substring(field.name.value.length+1))
            }
        }
    }
    return false
}
