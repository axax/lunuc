import Hook from 'util/hook'
import schemaGen from './gensrc/schema'
import resolverGen from './gensrc/resolver'
import {deepMergeToFirst} from 'util/deepMerge'

//TODO implement cache
/*const getApi = async ({slug, db}) => {
    const apis = (await db.collection('Api').find({slug, active: true}).toArray())
    if (apis.length > 0) {
        return apis[0]
    }

    return null
}

const runApiScript = ({api, db, req, res}) => {
    return new Promise(resolve => {

        try {
            const tpl = new Function(`
            const require = this.require
            const data = (async () => {
                try{
                    ${api.script}
                }catch(error){
                    this.resolve({error})
                }
            })()
            this.resolve({data})`)
            tpl.call({require, resolve, db, req, res})
        }catch (error) {
            resolve({error})
        }

    })
}*/

// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolverGen(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schemaGen)
})

