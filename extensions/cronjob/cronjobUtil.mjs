import GenericResolver from '../../api/resolver/generic/genericResolver.mjs'
import {ObjectId} from 'mongodb'
import crypto from 'crypto'
import fs from 'fs'
import readline from 'readline'
import { spawn } from 'child_process'
import path from 'path'
import {createRequireForScript} from '../../util/require.mjs'
import { fileURLToPath } from 'url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
                cronjobUtil.runJavascript(script, {log, debug, end, error, select, ...props})
            }
        }catch (e) {
            console.log('Error in runCronJob', e)
            error(e.message)
        }
        return result;
    },
    runJavascript: (script, args) => {

        const requireContext = createRequireForScript(import.meta.url)
        const tpl = new Function(`
        
        ${requireContext.script}
        (async () => {
            try {
                ${script}
            } catch(e) {
                this.error(e.message);
            }
            this.end();
        })();
        `)

        tpl.call({require: requireContext.require,...args})

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
