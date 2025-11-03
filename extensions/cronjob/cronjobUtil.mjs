import GenericResolver from '../../api/resolver/generic/genericResolver.mjs'
import {ObjectId} from 'mongodb'
import crypto from 'crypto'
import fs from 'fs'
import readline from 'readline'
import { spawn } from 'child_process'
import path from 'path'
import {createRequireForScript,createScriptForWorker} from '../../util/require.mjs'
import { fileURLToPath } from 'url'
import {Worker} from 'node:worker_threads'
import Hook from "../../util/hook.cjs";
import Cache from "../../util/cache.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const RUNNING_CRONJOBS = []

const cronjobUtil = {
    runCronJob: async (props, callback) => {

        const {cronjobId, script, scriptLanguage, context, db, noEntry} = props

        const result = {scriptLog: '', scriptDebug: '', scriptError: ''}


        if(RUNNING_CRONJOBS.includes(cronjobId)){
            console.log(`Run cronjob with id ${cronjobId} already running`)
            result.scriptError = 'Run cronjob with id '+cronjobId+' already running'

            if (callback) {
                callback(result)
            }
            return result
        }

        console.log(`Run cronjob with id ${cronjobId} started`)
        RUNNING_CRONJOBS.push(cronjobId)

        let dbResult
        if( !noEntry ) {
            dbResult = await GenericResolver.createEntity(db, {context}, 'CronJobExecution', {
                state: 'running',
                cronjob: new ObjectId(cronjobId)
            })

            result._id = dbResult._id
        }

        const log = (msg) => {
            result.scriptLog += (result.scriptLog?'\n':'')+msg
        }, debug = (msg) => {
            result.scriptDebug += (result.scriptDebug?'\n':'')+msg
        }, error = (msg) => {
            Hook.call('CronJobError', {db, context, cronjobId, scriptLanguage, script, error: {message:msg}})
            result.scriptError += (result.scriptError?'\n':'')+msg
        }

        const end = () => {
            const index = RUNNING_CRONJOBS.indexOf(cronjobId)
            if (index > -1) RUNNING_CRONJOBS.splice(index, 1)

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
            const finalArgs = {log, debug, end, error, select, ...props}

            if(!finalArgs.meta){
                finalArgs.meta = {}
            }
            if (scriptLanguage === 'Python') {
                cronjobUtil.runPythonScript(script, finalArgs)
            } else {
                cronjobUtil.runJavascript(script, finalArgs)
            }
        }catch (e) {
            console.error('Error in runCronJob', e)
            error(e.message)
        }
        return result;
    },
    runJavascript: (script, args) => {


        if(args.workerThread){
            const scriptContext = createScriptForWorker(import.meta.url)
            const worker = new Worker(` 
            ${scriptContext.script}            
            (async () => {
            
                const runScript = async () => {
                    ${script}
                }
                await runScript();
                
                if(this.db){
                    await this.db.client.close()
                }
            })()
            `, {eval: true, workerData: {context:args.context}})
            worker.on('message', msg => {
                if(msg.clearCache){
                    console.log(`Worker-thread: clearCache ${msg.clearCache}`)
                    Cache.clearStartWith(msg.clearCache)
                }else if(msg.console){
                    console[msg.console.type]('Worker-thread:',...msg.console.args)
                }else if(msg.log){
                    args.log(msg.log)
                }else if(msg.debug){
                    args.debug(msg.debug)
                }else if(msg.error){
                    args.error(msg.error)
                }else{
                    console.log(`Worker-thread: ${msg}`)
                }
            })

            worker.on('error', (err) => {
                if(err && err.message) {
                    args.error(err.message+' '+err.stack + ' -> line: '+err.lineNumber)
                }
            })
            worker.on('exit', (code) => {
                if (code !== 0) {
                    //args.error(`Worker stopped with exit code ${code}`)
                }
                args.end()
            })
        }else {
            const requireContext = createRequireForScript(import.meta.url)

            try {

                const tpl = new Function(` 
                ${requireContext.script}
                (async () => {
                    try {
                        const runScript = async () => {
                            ${script}
                        }
                        await runScript();
                    } catch(e) {
                        this.error(e.message+' '+e.stack + ${args.cronjobId?"' -> in "+args.cronjobId+"'":''});
                    }
                    this.end();
                })();
                `)

                tpl.call({require: requireContext.require, ...args})
            } catch (e) {
                args.error(e.message)
                args.end()

            }
        }

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
