import Hook from '../../util/hook.cjs'
import schemaGen from './gensrc/schema.mjs'
import resolverGen from './gensrc/resolver.mjs'
import {deepMergeToFirst} from '../../util/deepMerge.mjs'
import Util from '../../api/util/index.mjs'
import fs from 'fs'
import path from 'path'
import {createRequireForScript} from '../../util/require.mjs'

const GENSRC_PATH = path.join(path.resolve(), './extensions/hook/gensrc')

const registeredHook = []



const register = async (db) => {
    unregister()
    const results = (await db.collection('Hook').find({active: true}).toArray())
    let frontEndHooks = '/* this file is generated */\nimport Hook from \'../../../util/hook.cjs\'\n\n'
    let frontEndAdminHooks = frontEndHooks
    for (const entry of results) {
        if (!entry.execfilter || Util.execFilter(entry.execfilter)) {
            console.log(`register hook ${entry.name} (${entry.hook})`)

            if(entry.hook === 'Frontend'){
                frontEndHooks+=entry.script+'\n\n'
            }else if(entry.hook === 'FrontendAdmin'){
                frontEndAdminHooks+=entry.script+'\n\n'
            }else {
                try {
                    const requireContext = createRequireForScript(import.meta.url)
                    const fun = new Function(`
            
            ${requireContext.script}
                    
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

                        const result = await new Promise(resolve => {
                            fun.call({resolve, require: requireContext.require, Util, ...args})
                        })
                        if(result.error){
                            console.error(result.error)
                            Hook.call('HookError', {db, entry, error: result.error})
                        }else if(result.data && result.data.constructor === Promise){
                            // if result is a promise wait for it be finished
                            await result.data
                        }
                        return result
                    })


                    registeredHook.push({name, key, fun})
                } catch (e) {
                    console.error(e)
                    Hook.call('HookError', {db, entry, error: e})
                }
            }

        }
    }
    fs.writeFile(GENSRC_PATH + '/frontendhook.js', frontEndHooks, function (err) {
        if (err) {
            return console.log(err)
        }
    })
    fs.writeFile(GENSRC_PATH + '/frontendAdminHook.js', frontEndAdminHooks, function (err) {
        if (err) {
            return console.log(err)
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
