/**
 * Server side rendering of Remotion compositions to MP4.
 *
 * A composition is the same factory source the RemotionPlayer uses in a CmsPage:
 *   ({html, useCurrentFrame, interpolate, AbsoluteFill}) => (props) => html`...`
 * It is passed to the generic composition "CmsComposition" as inputProps.code, so
 * the bundle (client/components/remotion/server) is built only once.
 *
 * The work happens in a child process (remotionRenderWorker.mjs, reasons there).
 * Renders run one after another; the worker exits after REMOTION_IDLE_MS idle.
 *
 * Needs @remotion/bundler and @remotion/renderer (same version as remotion) and a
 * Chrome: by default Remotion downloads Chrome Headless Shell on first use
 * (into node_modules/.remotion), or browserExecutable points to an installed one.
 */
import path from 'path'
import {fork} from 'child_process'

const WORKER = path.join(path.resolve(), 'api/util/remotionRenderWorker.mjs')
const IDLE_MS = 10 * 60 * 1000

// survives the re-evaluation of db scripts (they run per request)
const state = globalThis.__lunucRemotion || (globalThis.__lunucRemotion = {worker: null, queue: Promise.resolve(), idleTimer: null, seq: 0})

const getWorker = () => {
    if (state.worker && state.worker.connected) {
        return state.worker
    }
    // no execArgv of the server (loaders, inspector), but enough heap for webpack
    const worker = fork(WORKER, [], {cwd: path.resolve(), execArgv: ['--max-old-space-size=3072'], stdio: ['ignore', 'inherit', 'inherit', 'ipc']})
    worker.on('exit', () => {
        if (state.worker === worker) {
            state.worker = null
        }
    })
    state.worker = worker
    return worker
}

const scheduleIdleExit = () => {
    clearTimeout(state.idleTimer)
    state.idleTimer = setTimeout(() => {
        if (state.worker) {
            state.worker.kill()
            state.worker = null
        }
    }, IDLE_MS)
    state.idleTimer.unref?.()
}

// syntax check before a process / browser is started (the code itself runs in chrome)
export const checkCompositionCode = (code) => {
    if (!code || typeof code !== 'string') {
        throw new Error('code is missing: the composition factory as source string')
    }
    if (/\bremotion\s*\.|=\s*remotion\b|=\s*Remotion\b/.test(code)) {
        throw new Error('there is no global "remotion" object: destructure the functions from the factory argument, e.g. ({html, useCurrentFrame, interpolate}) => (props) => ...')
    }
    const factory = new Function(`'use strict';return (${code}\n)`)()
    if (typeof factory !== 'function') {
        throw new Error('code must evaluate to a factory function: (lib) => (props) => element')
    }
}

/**
 * @param args {code, inputProps, durationInFrames, fps, width, height, outputFile, concurrency, browserExecutable, timeoutMs, onProgress}
 * @returns {Promise<{file, seconds, width, height, fps, renderMs}>}
 */
export const renderRemotionVideo = ({onProgress, ...args}) => {
    checkCompositionCode(args.code)
    const run = () => new Promise((resolve, reject) => {
        clearTimeout(state.idleTimer)
        const worker = getWorker()
        const id = ++state.seq
        const cleanup = () => {
            worker.off('message', onMessage)
            worker.off('exit', onExit)
            scheduleIdleExit()
        }
        const onMessage = (msg) => {
            if (!msg || msg.id !== id) return
            if (msg.type === 'progress') {
                onProgress && onProgress(msg.progress)
            } else if (msg.type === 'done') {
                cleanup()
                resolve(msg.result)
            } else if (msg.type === 'error') {
                cleanup()
                reject(new Error(msg.message))
            }
        }
        const onExit = (code, signal) => {
            cleanup()
            reject(new Error(`render process exited (${signal || code})`))
        }
        worker.on('message', onMessage)
        worker.on('exit', onExit)
        worker.send({id, type: 'render', args})
    })
    const job = state.queue.then(run, run)
    state.queue = job.catch(() => {})
    return job
}
