import GenericResolver from 'api/resolver/generic/genericResolver'
import {ObjectId} from 'mongodb'
import crypto from 'crypto'
import fs from 'fs'
import readline from 'readline'
import { spawn } from 'child_process'
import path from 'path'
import config from 'gensrc/config'

const {STATIC_PRIVATE_DIR} = config

const cronjobUtil = {
    runCronJob: async (props, callback) => {

        const {cronjobId, script, scriptLanguage, context, db, noEntry} = props

        const result = {scriptLog: '', scriptDebug: '', scriptError: ''}

        let dbResult
        if( !noEntry ) {
            dbResult = await GenericResolver.createEntity(db, {context}, 'CronJobExecution', {
                state: 'running',
                cronjob: ObjectId(cronjobId)
            })

            result._id = dbResult._id
        }

        const log = (msg) => {
            result.scriptLog += msg
        }, debug = (msg) => {
            result.scriptDebug += msg
        }, error = (msg) => {
            result.scriptError += msg
        }

        const end = () => {
            result.endTime = (new Date()).getTime()
            if( !noEntry ) {
                GenericResolver.updateEnity(db, context, 'CronJobExecution', {
                    _id: dbResult._id,
                    state: result.scriptError?'error':'finished',
                    ...result
                })
            }
            if (callback) {
                callback(result)
            }
        }

        const select = async (collection, fields, filter) => {
            await GenericResolver.entities(db, context, collection, fields, filter)
        }
        try {
            if (scriptLanguage === 'Python') {
                cronjobUtil.runPythonScript(script, {log, debug, end, error, select, ...props})
            } else {
                cronjobUtil.runJavascript(script, {__dirname, require, log, debug, end, error, select, ...props})
            }
        }catch (e) {
            console.log('Error in runCronJob', e)
            error(e.message)
        }
        return result;
    },
    runJavascript: (script, args) => {


        const tpl = new Function(`
        const __dirname = this.__dirname;
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
        
        
        
        (async () => {
            try {
                ${script}
            } catch(e) {
                this.error(e.message);
            }
            this.end();
        })();
        `)

        tpl.call(args)

    },
    runPythonScript: (script, args) => {

        const filename = 'tmp'+crypto.randomBytes(4).readUInt32LE(0)+'.py'
        const absPath = path.join(__dirname,filename)
        fs.writeFileSync(absPath, script);

        const pyprog = spawn('python', [absPath]);


        pyprog.on('exit', ()=>{
            args.end()
            fs.unlinkSync(absPath)
        })


        readline.createInterface({
            input     : pyprog.stdout,
            terminal  : false
        }).on('line', (line) => {
            args.log(line+'\n')
        })


        readline.createInterface({
            input     : pyprog.stderr,
            terminal  : false
        }).on('line', (line) => {
            args.error(line+'\n')
        })


    }
}

export default cronjobUtil
