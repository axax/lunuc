/**
 * Child process of remotionRender.mjs: bundles and renders Remotion compositions.
 *
 * Runs in its own process because the lunuc server defines a global "window" stub
 * (api/index.mjs), which makes Remotion believe it runs in a browser, and because
 * webpack bundling and frame encoding would otherwise block the server event loop.
 * The process stays alive between renders (bundle cache) until it is idle.
 *
 * IPC: {id, type: 'render', args} → {id, type: 'progress', progress} | {id, type: 'done', result} | {id, type: 'error', message}
 */
import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'

const ENTRY_DIR = path.join(path.resolve(), 'client/components/remotion')
const ENTRY = path.join(ENTRY_DIR, 'server/index.js')
const BUNDLE_FILES = ['server/index.js', 'server/CmsComposition.js', 'factory.js']

let bundled = null, bundledHash = null

const entryHash = () => {
    const h = crypto.createHash('sha1')
    BUNDLE_FILES.forEach(f => h.update(fs.readFileSync(path.join(ENTRY_DIR, f))))
    return h.digest('hex').slice(0, 12)
}

// bundles once, again only when one of the entry files changed
const getBundle = async () => {
    const hash = entryHash()
    if (bundled && bundledHash === hash) {
        return bundled
    }
    const {bundle} = await import('@remotion/bundler')
    bundled = await bundle({entryPoint: ENTRY, outDir: path.join(os.tmpdir(), 'lunuc-remotion-bundle-' + hash), enableCaching: true})
    bundledHash = hash
    return bundled
}

const render = async ({code, inputProps = {}, durationInFrames, fps = 30, width = 1280, height = 720,
                          outputFile, concurrency = 2, browserExecutable = null, timeoutMs = 10 * 60 * 1000}, onProgress) => {
    const started = Date.now()
    const {selectComposition, renderMedia, makeCancelSignal} = await import('@remotion/renderer')
    const serveUrl = await getBundle()
    const props = {code, inputProps, durationInFrames, fps, width, height}
    const composition = await selectComposition({serveUrl, id: 'CmsComposition', inputProps: props, browserExecutable})
    const {cancelSignal, cancel} = makeCancelSignal()
    const timer = setTimeout(cancel, timeoutMs)
    try {
        await fs.promises.mkdir(path.dirname(outputFile), {recursive: true})
        await renderMedia({
            composition, serveUrl, codec: 'h264', outputLocation: outputFile, inputProps: props,
            concurrency, browserExecutable, cancelSignal, logLevel: 'error',
            onProgress: ({progress}) => onProgress(progress)
        })
    } finally {
        clearTimeout(timer)
    }
    return {file: outputFile, seconds: composition.durationInFrames / composition.fps,
        width: composition.width, height: composition.height, fps: composition.fps, renderMs: Date.now() - started}
}

process.on('message', async (msg) => {
    if (!msg || msg.type !== 'render') {
        return
    }
    let lastSent = 0
    try {
        const result = await render(msg.args, (progress) => {
            if (progress - lastSent >= 0.05 || progress === 1) {
                lastSent = progress
                process.send({id: msg.id, type: 'progress', progress})
            }
        })
        process.send({id: msg.id, type: 'done', result})
    } catch (e) {
        process.send({id: msg.id, type: 'error', message: String((e && (e.stack || e.message)) || e)})
    }
})

process.send({type: 'ready'})
