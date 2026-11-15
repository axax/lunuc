/**
 * Server side rendering of Remotion compositions to MP4.
 *
 * A composition is the same factory source the RemotionPlayer uses in a CmsPage:
 *   ({html, useCurrentFrame, interpolate, AbsoluteFill}) => (props) => html`...`
 * It is passed to the generic composition "CmsComposition" as inputProps.code, so
 * the bundle (client/components/remotion/server) is built only once per process.
 *
 * Needs @remotion/bundler and @remotion/renderer (same version as remotion) and a
 * Chrome: by default Remotion downloads Chrome Headless Shell on first use
 * (into node_modules/.remotion), or browserExecutable points to an installed one.
 */
import path from 'path'
import fs from 'fs'
import os from 'os'
import crypto from 'crypto'

const ENTRY_DIR = path.join(path.resolve(), 'client/components/remotion')
const ENTRY = path.join(ENTRY_DIR, 'server/index.js')
const BUNDLE_FILES = ['server/index.js', 'server/CmsComposition.js', 'factory.js']

// survives the re-evaluation of db scripts (they run per request)
const state = globalThis.__lunucRemotion || (globalThis.__lunucRemotion = {bundle: null, hash: null, bundling: null, queue: Promise.resolve()})

const entryHash = () => {
    const h = crypto.createHash('sha1')
    BUNDLE_FILES.forEach(f => h.update(fs.readFileSync(path.join(ENTRY_DIR, f))))
    return h.digest('hex').slice(0, 12)
}

// bundles once, again only when one of the entry files changed
export const getRemotionBundle = async () => {
    const hash = entryHash()
    if (state.bundle && state.hash === hash) {
        return state.bundle
    }
    if (!state.bundling) {
        state.bundling = (async () => {
            const {bundle} = await import('@remotion/bundler')
            const outDir = path.join(os.tmpdir(), 'lunuc-remotion-bundle-' + hash)
            const serveUrl = await bundle({entryPoint: ENTRY, outDir, enableCaching: true})
            state.bundle = serveUrl
            state.hash = hash
            return serveUrl
        })().finally(() => {
            state.bundling = null
        })
    }
    return state.bundling
}

// syntax check in node before a browser is started (the code itself runs in chrome)
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
 * @returns {Promise<{file, seconds, renderMs}>}
 * Renders run one after another per process (a render uses several cores).
 */
export const renderRemotionVideo = ({code, inputProps = {}, durationInFrames, fps = 30, width = 1280, height = 720,
                                        outputFile, concurrency = 2, browserExecutable = null, timeoutMs = 10 * 60 * 1000,
                                        onProgress}) => {
    checkCompositionCode(code)
    const run = async () => {
        const started = Date.now()
        const {selectComposition, renderMedia, makeCancelSignal} = await import('@remotion/renderer')
        const serveUrl = await getRemotionBundle()
        const props = {code, inputProps, durationInFrames, fps, width, height}
        const composition = await selectComposition({serveUrl, id: 'CmsComposition', inputProps: props, browserExecutable})
        const {cancelSignal, cancel} = makeCancelSignal()
        const timer = setTimeout(cancel, timeoutMs)
        try {
            await fs.promises.mkdir(path.dirname(outputFile), {recursive: true})
            await renderMedia({
                composition, serveUrl, codec: 'h264', outputLocation: outputFile, inputProps: props,
                concurrency, browserExecutable, cancelSignal, muted: false, logLevel: 'warn',
                onProgress: onProgress ? ({progress}) => onProgress(progress) : undefined
            })
        } finally {
            clearTimeout(timer)
        }
        return {file: outputFile, seconds: composition.durationInFrames / composition.fps,
            width: composition.width, height: composition.height, fps: composition.fps, renderMs: Date.now() - started}
    }
    const job = state.queue.then(run, run)
    state.queue = job.catch(() => {})
    return job
}
