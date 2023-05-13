import schema from './gensrc/schema'
import resolver from './gensrc/resolver'
import Hook from '../../util/hook.cjs'
import {deepMergeToFirst} from '../../util/deepMerge.mjs'
import {findAndReplaceObjectIds} from '../../api/util/graphql.js'
import {getType} from '../../util/types.mjs'


let userRestrictions = {}

const register = async (db) => {
    userRestrictions = {}
    const results = (await db.collection('UserRestriction').find({active: true}).toArray())
    for(const result of results){
        findAndReplaceObjectIds(result.filter)
        for(const type of result.type){
            if(!userRestrictions[type]){
                userRestrictions[type] = []
            }
            if(result.user) {
                result.user = result.user.map(_id => _id.toString())
            }
            if(result.userGroup) {
                result.userGroup = result.userGroup.map(_id => _id.toString())
            }
            userRestrictions[type].push(result)
        }
    }

}


const hasGroupMatch = (group1, group2) => {
   if(group1 && group2){
       for(let i = 0; i < group1.length; i++){
           if(group2.indexOf(group1[i])){
               return true
           }
       }
   }
   return false
}

Hook.on('enhanceTypeMatch', async ({type, context, match}) => {
    if(userRestrictions[type]){
        for(const rule of userRestrictions[type]){
            if(rule.filter && (rule.user.indexOf(context.id)>=0 || hasGroupMatch(rule.userGroup, context.group))){
                if(rule.mode=='extend'){
                    Object.keys(rule.filter).forEach(key=>{
                        if(rule.filter[key].$remove || rule.filter[key]['#remove']){
                            // remove operator
                            delete match[key]
                        }else if(key=='ownerGroup' || key=='createdBy'){
                            if(!match.ownerGroup && !match.createdBy){
                                return
                            }
                            if(key=='ownerGroup'){

                                const typeDefinition = getType(type)
                                if(typeDefinition && !typeDefinition.fields.find(field=>field.name==='ownerGroup')) {
                                    return
                                }
                            }
                            if(!match.$or){
                                match.$or= []
                            }
                            if(match[key]){
                                match.$or.push({[key]:match[key]})
                                delete match[key]
                            }

                            let subMatch = match.$or.find(f=>Object.keys(f).find(k=>k==key))

                            if(!subMatch){
                                subMatch = {[key]: rule.filter[key]}
                                match.$or.push(subMatch)
                            }else{
                                subMatch[key].$in.push(...rule.filter[key].$in)
                            }
                        }else{
                            match[key] = rule.filter[key]
                        }

                    })
                    console.log(JSON.stringify(match))
                }
            }
        }
    }
})

// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolver(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schema)
})


// Hook when db is ready
Hook.on('dbready', ({db}) => {
    register(db)
})

// Hook when the type CronJob has changed
Hook.on(['typeUpdated_UserRestriction', 'typeCreated_UserRestriction', 'typeDeleted_UserRestriction', 'typeCloned_UserRestriction'], ({db}) => {
    register(db)
})
