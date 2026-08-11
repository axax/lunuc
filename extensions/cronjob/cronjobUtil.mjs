import GenericResolver from '../../api/resolver/generic/genericResolver.mjs'
import {ObjectId} from 'mongodb'
import crypto from 'crypto'
import fs from 'fs'
import readline from 'readline'
import {spawn} from 'child_process'
import path from 'path'
import {createRequireForScript, createScriptForWorker} from '../../util/require.mjs'
import {fileURLToPath} from 'url'
import {Worker} from 'node:worker_threads'
import Hook from "../../util/hook.cjs";
import Cache from "../../util/cache.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Time after which a running cronjob is considered stuck. Can be overridden per job via props.maxRuntime
const DEFAULT_MAX_RUNTIME = 1000 * 60 * 60

/**
 * Map of currently running cronjobs.
 * key   = cronjobId
 * value = {startTime, executionId, watchdog, kill, forceEnd}
 */
const RUNNING_CRONJOBS = new Map()

const cronjobUtil = {

    runCronJob: async (props, callback) => {

        const {cronjobId, script, scriptLanguage, context, db, noEntry} = props
        const maxRuntime = props.maxRuntime || DEFAULT_MAX_RUNTIME

        const result = {scriptLog: '', scriptDebug: '', scriptError: ''}

        // --- check for an already running instance -------------------------------
        const previous = RUNNING_CRONJOBS.get(cronjobId)
        if (previous) {
            const runtime = Date.now() - previous.startTime

            if (runtime < maxRuntime) {
                const msg = `Run cronjob with id ${cronjobId} already running since ${Math.round(runtime / 1000)}s`
                console.log(msg)
                result.scriptError = msg

                if (callback) {
                    callback(result)
                }
                return result
            }

            // the previous run exceeded its max runtime -> treat it as stuck and release the lock
            console.warn(`Cronjob ${cronjobId} is stuck since ${Math.round(runtime / 1000)}s. Releasing lock and starting a new run.`)
            previous.forceEnd(`Cronjob was stuck for ${Math.round(runtime / 1000)}s and got aborted by a new run`)
        }

        console.log(`Run cronjob with id ${cronjobId} started`)

        const entry = {
            startTime: Date.now(),
            executionId: null,
            watchdog: null,
            kill: null,
            forceEnd: null
        }
        RUNNING_CRONJOBS.set(cronjobId, entry)

        let dbResult
        if (!noEntry) {
            try {
                dbResult = await GenericResolver.createEntity(db, {context}, 'CronJobExecution', {
                    state: 'running',
                    cronjob: new ObjectId(cronjobId)
                })
                result._id = dbResult._id
                entry.executionId = dbResult._id
            } catch (e) {
                // never leave a lock behind if the execution entry cannot be created
                RUNNING_CRONJOBS.delete(cronjobId)
                console.error('Error while creating CronJobExecution', e)
                result.scriptError = e.message
                if (callback) {
                    callback(result)
                }
                return result
            }
        }

        const log = (msg) => {
            result.scriptLog += (result.scriptLog ? '\n' : '') + msg
        }, debug = (msg) => {
            result.scriptDebug += (result.scriptDebug ? '\n' : '') + msg
        }, error = (msg) => {
            Hook.call('CronJobError', {db, context, cronjobId, scriptLanguage, script, error: {message: msg}})
            result.scriptError += (result.scriptError ? '\n' : '') + msg
        }

        // end() must be idempotent: it can be triggered by the script itself,
        // by the worker exit handler and by the watchdog
        let ended = false
        const end = () => {
            if (ended) {
                return
            }
            ended = true

            if (entry.watchdog) {
                clearTimeout(entry.watchdog)
                entry.watchdog = null
            }

            // only delete if the lock still belongs to this run
            if (RUNNING_CRONJOBS.get(cronjobId) === entry) {
                RUNNING_CRONJOBS.delete(cronjobId)
            }

            result.endTime = (new Date()).getTime()

            if (!noEntry && dbResult) {
                Promise.resolve(GenericResolver.updateEnity(db, context, 'CronJobExecution', {
                    _id: dbResult._id,
                    state: result.scriptError ? 'error' : 'finished',
                    ...result
                })).catch(e => console.error('Error while updating CronJobExecution', e))
            }

            if (callback) {
                callback(result)
            }
        }

        // allows the runner (worker / child process) to register a way to be terminated
        const registerKill = (fn) => {
            entry.kill = fn
        }

        entry.forceEnd = (reason) => {
            if (reason) {
                error(reason)
            }
            if (entry.kill) {
                try {
                    entry.kill()
                } catch (e) {
                    console.error(`Error while killing cronjob ${cronjobId}`, e)
                }
            }
            end()
        }

        // --- watchdog ------------------------------------------------------------
        entry.watchdog = setTimeout(() => {
            console.error(`Cronjob ${cronjobId} exceeded max runtime of ${maxRuntime}ms and gets aborted`)
            Hook.call('CronJobTimeout', {db, context, cronjobId, scriptLanguage, script, maxRuntime})
            entry.forceEnd(`Cronjob exceeded max runtime of ${maxRuntime}ms and was aborted`)
        }, maxRuntime)

        if (entry.watchdog.unref) {
            // do not keep the process alive just because of the watchdog
            entry.watchdog.unref()
        }

        const select = async (collection, fields, filter) => {
            return await GenericResolver.entities(db, context, collection, fields, filter)
        }

        try {
            const finalArgs = {log, debug, end, error, select, registerKill, ...props}

            if (!finalArgs.meta) {
                finalArgs.meta = {}
            }
            if (scriptLanguage === 'Python') {
                cronjobUtil.runPythonScript(script, finalArgs)
            } else {
                cronjobUtil.runJavascript(script, finalArgs)
            }
        } catch (e) {
            console.error('Error in runCronJob', e)
            error(e.message)
            // important: release the lock, otherwise the job can never be started again
            end()
        }

        return result
    },

    /**
     * Aborts a running cronjob. Returns true if a job was found.
     * Note: scripts running without workerThread cannot really be stopped,
     * only the lock and the execution entry are released.
     */
    abortCronJob: (cronjobId, reason = 'Cronjob was aborted manually') => {
        const entry = RUNNING_CRONJOBS.get(cronjobId)
        if (!entry) {
            return false
        }
        entry.forceEnd(reason)
        return true
    },

    /**
     * Returns all currently running cronjobs - useful for monitoring / admin ui
     */
    getRunningCronJobs: () => {
        const now = Date.now()
        const jobs = []
        RUNNING_CRONJOBS.forEach((entry, cronjobId) => {
            jobs.push({
                cronjobId,
                executionId: entry.executionId,
                startTime: entry.startTime,
                runtime: now - entry.startTime,
                killable: !!entry.kill
            })
        })
        return jobs
    },

    /**
     * Marks CronJobExecution entries that are still in state 'running' but were
     * started before the given threshold as 'aborted'. Call this once on server start,
     * because after a crash or restart no job of the previous process is running anymore.
     */
    cleanupStaleExecutions: async (db, {maxRuntime = DEFAULT_MAX_RUNTIME} = {}) => {
        try {
            const threshold = Math.floor((Date.now() - maxRuntime) / 1000)
            const res = await db.collection('CronJobExecution').updateMany({
                state: 'running',
                _id: {$lt: ObjectId.createFromTime(threshold)}
            }, {
                $set: {
                    state: 'aborted',
                    scriptError: 'Execution was still marked as running after a server restart'
                }
            })
            if (res.modifiedCount) {
                console.log(`Cleaned up ${res.modifiedCount} stale CronJobExecution entries`)
            }
            return res.modifiedCount
        } catch (e) {
            console.error('Error in cleanupStaleExecutions', e)
            return 0
        }
    },

    runJavascript: (script, args) => {

        if (args.workerThread) {
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
            `, {eval: true, workerData: {context: args.context}})

            // allows the watchdog to really terminate the job
            if (args.registerKill) {
                args.registerKill(() => worker.terminate())
            }

            worker.on('message', msg => {
                if (msg.clearCache) {
                    console.log(`Worker-thread: clearCache ${msg.clearCache}`)
                    Cache.clearStartWith(msg.clearCache)
                } else if (msg.console) {
                    console[msg.console.type]('Worker-thread:', ...msg.console.args)
                } else if (msg.log) {
                    args.log(msg.log)
                } else if (msg.debug) {
                    args.debug(msg.debug)
                } else if (msg.error) {
                    args.error(msg.error)
                } else {
                    console.log(`Worker-thread: ${msg}`)
                }
            })

            worker.on('error', (err) => {
                if (err && err.message) {
                    args.error(err.message + ' ' + err.stack + ' -> line: ' + err.lineNumber)
                }
                args.end()
            })

            worker.on('exit', (code) => {
                if (code !== 0) {
                    //args.error(`Worker stopped with exit code ${code}`)
                }
                args.end()
            })
        } else {
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
                        this.error(e.message+' '+e.stack + ${args.cronjobId ? "' -> in " + args.cronjobId + "'" : ''});
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

        const filename = 'tmp' + crypto.randomBytes(4).readUInt32LE(0) + '.py'
        const absPath = path.join(__dirname, filename)
        fs.writeFileSync(absPath, script)

        const cleanup = () => {
            try {
                if (fs.existsSync(absPath)) {
                    fs.unlinkSync(absPath)
                }
            } catch (e) {
                console.error('Error while removing temporary python script', e)
            }
        }

        let pyprog
        try {
            pyprog = spawn('python', [absPath])
        } catch (e) {
            args.error(e.message)
            cleanup()
            args.end()
            return
        }

        if (args.registerKill) {
            args.registerKill(() => {
                pyprog.kill('SIGKILL')
            })
        }

        // without this handler a failing spawn would never emit 'exit' and the lock would stay forever
        pyprog.on('error', (err) => {
            args.error(err.message)
            cleanup()
            args.end()
        })

        pyprog.on('exit', (code, signal) => {
            if (signal) {
                args.error(`Python script was terminated with signal ${signal}`)
            }
            cleanup()
            args.end()
        })

        readline.createInterface({
            input: pyprog.stdout,
            terminal: false
        }).on('line', (line) => {
            args.log(line + '\n')
        })

        readline.createInterface({
            input: pyprog.stderr,
            terminal: false
        }).on('line', (line) => {
            args.error(line + '\n')
        })
    }
}

export default cronjobUtil