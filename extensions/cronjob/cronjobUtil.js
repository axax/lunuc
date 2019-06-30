import GenericResolver from 'api/resolver/generic/genericResolver'
import {ObjectId} from 'mongodb'
import Util from 'api/util'
import crypto from 'crypto'
import fs from 'fs'
import { spawn } from 'child_process'
import path from "path";


const cronjobUtil = {
    runCronJob: async (props, callback) => {

        const {cronjobId, script, scriptLanguage, context, db} = props

        const dbResult = await GenericResolver.createEnity(db, context, 'CronJobExecution', {
            state: 'running',
            cronjob: ObjectId(cronjobId)
        })


        let scriptLog = '', scriptDebug = ''
        const log = (msg) => {
            console.log(msg)
            scriptLog += msg
        }, debug = (msg) => {
            scriptDebug += msg
        }

        const error = (scriptError) => {
            GenericResolver.updateEnity(db, context, 'CronJobExecution', {
                _id: dbResult._id,
                state: 'error',
                endTime: (new Date()).getTime(),
                scriptError,
                scriptLog,
                scriptDebug
            })
        }

        const success = () => {
            GenericResolver.updateEnity(db, context, 'CronJobExecution', {
                _id: dbResult._id,
                state: 'finished',
                endTime: (new Date()).getTime(),
                scriptLog,
                scriptDebug
            })
        }

        const end = () => {
            if (callback) {
                callback()
            }
        }

        const select = async (collection, fields, filter) => {
            await GenericResolver.entities(db, context, collection, fields, filter)
        }
        if (scriptLanguage === 'Python') {
            cronjobUtil.runPythonScript(script, {log, debug, end, error, success, select, ...props})
        } else {
            cronjobUtil.runJavascript(script, {require, log, debug, end, error, success, select, ...props})
        }
        return dbResult._id;
    },
    runJavascript: (script, args) => {


        const tpl = new Function(`
        const require = this.require;
        const start = (async () => {
            try {
            
                ${script}
            
                this.success();
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


        const pyprog = spawn('python', [filename]);

        pyprog.stdout.on('data', (data) => {
            args.log(data)

            args.success()


            args.end()
            fs.unlinkSync(absPath)
        })

        pyprog.stderr.on('data', (data) => {
            args.error(data)
            args.end()
            fs.unlinkSync(absPath)
        })



    },
    execFilter: (filter) => {
        return Util.matchFilterExpression(filter, Util.systemProperties())
    }
}

export default cronjobUtil
