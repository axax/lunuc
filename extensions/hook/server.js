import Hook from 'util/hook'
import schemaGen from './gensrc/schema'
import resolverGen from './gensrc/resolver'
import {deepMergeToFirst} from 'util/deepMerge'
import Util from '../../api/util'
import fs from 'fs'
import path from 'path'
const registeredHook = []

const GENSRC_PATH = path.join(__dirname, './gensrc')

import config from 'gen/config'
const {STATIC_PRIVATE_DIR} = config

const register = async (db) => {
    unregister()
    const results = (await db.collection('Hook').find({active: true}).toArray())
    let frontEndHooks = '/* this file is generated */\nimport Hook from \'util/hook\'\n\n'
    let frontEndAdminHooks = frontEndHooks
    results.forEach(async entry => {
        if (!entry.execfilter || Util.execFilter(entry.execfilter)) {
            console.log(`register hook ${entry.name} (${entry.hook})`)

            if(entry.hook === 'Frontend'){
                frontEndHooks+=entry.script+'\n\n'
            }else if(entry.hook === 'FrontendAdmin'){
                frontEndAdminHooks+=entry.script+'\n\n'
            }else {
                try {
                    const fun = new Function(`
            const fs = this.require('fs')
            const path = this.require('path')
            const paths = [
                {
                    name: 'static_private',
                    rel: '../..${STATIC_PRIVATE_DIR}/'
                },
                {
                    name: 'api',
                    rel: '../../api/'
                },
                {
                    name: 'client',
                    rel: '../../client/'
                },
                {
                    name: 'ext',
                    rel: '../../extensions/'
                },
                {
                    name: 'gen',
                    rel: '../../gensrc/'
                }
            ]
            const require = (filePath)=>{               
                if(filePath.startsWith('@')){
                    for(let i = 0; i < paths.length;i++){
                        const p = paths[i]
                        if(filePath.startsWith('@'+p.name+'/')){    
                            let pathToCheck = path.join(this.__dirname, p.rel+filePath.substring(p.name.length+2))
                            
                            if (fs.existsSync(pathToCheck+'.js') || fs.existsSync(pathToCheck)) {                             
                                return this.require(pathToCheck)
                            }
                        }
                    }   
                }
                
                return this.require(filePath)
            }
                    
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
                            fun.call({require, resolve, __dirname, Util, ...args})
                        })
                        if(result.error){
                            console.error(result.error)
                            Hook.call('HookError', {entry, error: result.error})
                        }else if(result.data && result.data.constructor === Promise){
                            // if result is a promise wait for it be finished
                            await result.data
                        }
                        return result
                    })


                    registeredHook.push({name, key, fun})
                } catch (e) {
                    console.error(e)
                    Hook.call('HookError', {entry, error: e})
                }
            }

        }
    })
    fs.writeFile(GENSRC_PATH + "/frontendhook.js", frontEndHooks, function (err) {
        if (err) {
            return console.log(err)
        }
    })
    fs.writeFile(GENSRC_PATH + "/frontendAdminHook.js", frontEndAdminHooks, function (err) {
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
