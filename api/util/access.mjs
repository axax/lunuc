
export const userHasAccessToObject =(context, item) =>{
    const createdByIdAsString = item.createdBy?(item.createdBy._id?item.createdBy._id.toString():item.createdBy.toString()):''
    if(createdByIdAsString === context.id){
        return true
    }
    if(context.junior && context.junior.indexOf(createdByIdAsString)>=0){
        return true
    }
    if(item?.ownerGroup?.length>0 && context?.group?.length>0){
        for(const ownerGroup of item.ownerGroup){
            const ownerGroupAsString = ownerGroup.toString()
            if(context.group.indexOf(ownerGroupAsString)>=0){
                return true
            }
        }
    }
    return false
}