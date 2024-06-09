import {ObjectId} from 'mongodb'

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


export const getFieldsFromGraphqlInfoSelectionSet = (selections, maxLevel=2, level=0)=>{
    if(!selections || level>=maxLevel){
        return true
    }
    const map ={}
    selections.forEach(selection=>{
        if(selection.selectionSet) {
            map[selection.name.value] = getFieldsFromGraphqlInfoSelectionSet(selection.selectionSet.selections, maxLevel, level+1)
        }else{
            map[selection.name.value] = true
        }
    })
    return map
}

export const fieldsToArrayStructure = (fields) => {
    const arr = []
    for (const [fieldName, subField] of Object.entries(fields)) {
        if(subField.constructor === Object){
            arr.push({[fieldName]:fieldsToArrayStructure(subField)})
        }else{
            arr.push(fieldName)
        }
    }
    return arr
}

export const findAndReplaceObjectIds = function (obj) {
    for (var i in obj) {
        if (obj.hasOwnProperty(i)) {
            const v = obj[i]
            if (v)
                if (v.constructor === Array) {
                    v.forEach((x, j) => {
                        if (x.constructor === String) {
                            if (i === '$in' && ObjectId.isValid(x)) {
                                v[j] = new ObjectId(x)
                            }
                        } else {
                            findAndReplaceObjectIds(x)
                        }
                    })
                } else if (v.constructor === String) {
                    if (v.indexOf('.') < 0 && ObjectId.isValid(v)) {
                        obj[i] = new ObjectId(v)
                    }
                } else {
                    findAndReplaceObjectIds(v)
                }
        }
    }
    return null
}
