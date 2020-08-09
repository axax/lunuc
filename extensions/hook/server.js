import Hook from 'util/hook'
import schemaGen from './gensrc/schema'
import resolverGen from './gensrc/resolver'
import {deepMergeToFirst} from 'util/deepMerge'
import Util from '../../api/util'

const registeredHook = []

const register = async (db) => {
    unregister()
    const results = (await db.collection('Hook').find({active: true}).toArray())
    results.forEach(async entry => {
        if (!entry.execfilter || Util.execFilter(entry.execfilter)) {
            console.log(`register hook ${entry.name} (${entry.hook})`)

            try {
                const fun = new Function(`
            const require = this.require
            const data = (async () => {
                try{
                    ${entry.script}
                }catch(error){
                    this.resolve({error})
                }
            })()
            this.resolve({data})`),
                    name = entry.hook,
                    key = entry._id.toString()


                Hook.on(`${name}.${key}`, async (args) => {
                    await new Promise(resolve => {
                        fun.call({require, resolve, Util, ...args})
                    })
                })


                registeredHook.push({name, key, fun})
            } catch (e) {
                console.log(e)
            }

        }
    })
}


const unregister = () => {
    for (let i = registeredHook.length - 1; i >= 0; i--) {
        const entry = registeredHook[i]
        Hook.remove(entry.name, entry.key)
        delete entry.fun
        registeredHook.splice(i, 1)
    }
}

// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolverGen(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schemaGen)
})


// Hook when db is ready
Hook.on('dbready', ({db}) => {
    register(db)
})

// Hook when the type CronJob has changed
Hook.on(['typeUpdated_Hook', 'typeCreated_Hook', 'typeDeleted_Hook', 'typeCloned_Hook'], ({db}) => {
    register(db)
})
