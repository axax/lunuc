import schema from './gensrc/schema'
import resolver from './gensrc/resolver'
import Hook from '../../util/hook.cjs'
import {deepMergeToFirst} from '../../util/deepMerge.mjs'


let userRestrictions = {}

const register = async (db) => {
    userRestrictions = {}
    const results = (await db.collection('UserRestriction').find({active: true}).toArray())
    for(const result of results){
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

Hook.on('beforeTypeLoaded', async ({type, db, context, match, data, otherOptions}) => {
    if(userRestrictions[type]){
        for(const rule of userRestrictions[type]){
            if(rule.filter && (rule.user.indexOf(context.id)>=0 || hasGroupMatch(rule.userGroup, context.group))){
                if(rule.mode==='extend'){
                    Object.keys(rule.filter).forEach(key=>{
                        match[key] = rule.filter[key]
                    })
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
