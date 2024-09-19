import config from '../gensrc/config.mjs'
import path from 'path'

import {createRequire} from 'module'
import {fileURLToPath} from 'url'

const {STATIC_DIR, STATIC_PRIVATE_DIR} = config
const ROOT_DIR = path.resolve()

const STATIC_PRIVAT_ABS = path.join(ROOT_DIR, STATIC_PRIVATE_DIR)
const STATIC_ABS = path.join(ROOT_DIR, STATIC_DIR)
const API_ABS = path.join(ROOT_DIR, './api')
const SERVER_ABS = path.join(ROOT_DIR, './server')
const CLIENT_ABS = path.join(ROOT_DIR, './client')
const EXTENSION_ABS = path.join(ROOT_DIR, './extensions')
const GENSRC_ABS = path.join(ROOT_DIR, './gensrc')
const UTIL_ABS = path.join(ROOT_DIR, './util')

const enhancePathScript = `
            const paths = [
                {
                    name: 'static',
                    path: '${STATIC_ABS}'
                },
                {
                    name: 'static_private',
                    path: '${STATIC_PRIVAT_ABS}'
                },
                {
                    name: 'api',
                    path: '${API_ABS}'
                },
                {
                    name: 'server',
                    path: '${SERVER_ABS}'
                },
                {
                    name: 'client',
                    path: '${CLIENT_ABS}'
                },
                {
                    name: 'ext',
                    path: '${EXTENSION_ABS}'
                },
                {
                    name: 'gen',
                    path: '${GENSRC_ABS}'
                },
                {
                    name: 'util',
                    path: '${UTIL_ABS}'
                }
            ]
            const enhanceFilePath = (filePath) =>{
                if(filePath.startsWith('@')){
                    for(let i = 0; i < paths.length;i++){
                        const p = paths[i]
                        if(filePath.startsWith('@'+p.name+'/')){    
                            let pathToCheck = path.join(p.path, filePath.substring(p.name.length+2))
                            
                            if (fs.existsSync(pathToCheck+'.mjs')) {    
                                return pathToCheck+'.mjs'
                            }
                            
                            if (fs.existsSync(pathToCheck+'.cjs')) {                             
                                return pathToCheck+'.cjs'
                            }
                            
                            if (fs.existsSync(pathToCheck+'.js')) {                             
                                return pathToCheck+'.js'
                            }
                            
                            if (fs.existsSync(pathToCheck)) {                             
                                return pathToCheck
                            }
                        }
                    }   
                }
                
                return filePath
            }`

export const createRequireForScript = (importPath) => {
    const myRequire = createRequire(importPath)
    const dirname = path.dirname(fileURLToPath(importPath))

    return {
        require: myRequire,
        __dirname: dirname,
        script: `        
            const fs = this.require('fs')
            const path = this.require('path')
            const module = this.require('module')
            const __dirname = '${dirname}'
            this.__dirname = __dirname
            this.getDb = () =>{
                return this.db
            }
            this.parentPort = {postMessage:()=>{}}
            ${enhancePathScript}
            const requireAsync = async (filePath)=>{               
                const newFilePath = enhanceFilePath(filePath)
               
                if(${!!_app_.es6Module}){
                    return await import(newFilePath)
                }else{
                    return this.require(newFilePath)
                }
            }
            
            const require = (filePath)=>{
                //console.log('deprecated method require in ${importPath} - ' + filePath + '  --> use requireAsync instead')  */             
                const newFilePath = enhanceFilePath(filePath)
               
                if(${!!_app_.es6Module}){
                    console.log('not supported for es6 module '+ filePath) 
                    //return await import(newFilePath)
                }else{
                    return this.require(newFilePath)
                }
            }`
    }
}


export const createScriptForWorker = (importPath) => {
    const dirname = path.dirname(fileURLToPath(importPath))

    return {
        __dirname: dirname,
        script: `        
            global._app_ = {start: new Date().getTime()}
            const fs = global.require('fs')
            const path = global.require('path')
            const module = global.require('module')            
            const __dirname = '${dirname}'      
            ${enhancePathScript}
            const requireAsync = async (filePath)=>{               
                const newFilePath = enhanceFilePath(filePath)
                return await import(newFilePath)
            }
            const {workerData,parentPort} = require('worker_threads')
            this.parentPort = parentPort
            this.context = workerData.context
            this.log=(msg)=>{
                parentPort.postMessage({log:msg})
            }
            this.debug=(msg)=>{
                parentPort.postMessage({debug:msg})
            }
            this.error=(msg)=>{
                parentPort.postMessage({error:msg})
            }
            global.console={
                log: (...args)=>{
                    parentPort.postMessage({console:{type:'log',args}})
                },
                info: (...args)=>{
                    parentPort.postMessage({console:{type:'info',args}})
                },
                warn: (...args)=>{
                    parentPort.postMessage({console:{type:'warn',args}})
                },
                error: (...args)=>{
                    parentPort.postMessage({console:{type:'error',args}})
                },
                debug: (...args)=>{
                    parentPort.postMessage({console:{type:'debug',args}})
                }
            }
            
            this.getDb = async ()=>{
                if(this.db){
                    return this.db
                }
                const {MONGO_URL,dbConnection} = await requireAsync('@api/database.mjs')                
                return await (new Promise((resolve) => {
                    dbConnection(MONGO_URL,(err, db, client)=>{
                        if(err){
                            console.log(err)
                        }
                        this.db = db
                        resolve(db)
                    })
                }))
            };
                        
            `

    }
}
