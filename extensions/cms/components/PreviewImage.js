import React from 'react'

// Page previews in the admin list are generated on demand by /lunucapi/generate/png.
// That api renders at most 3 previews per 2 seconds; beyond that it redirects to a
// "Vorschau wird erstellt" placeholder for 10 seconds - and the placeholder used to stay
// until the page was reloaded.
// A placeholder is recognized by its size (a real preview has exactly the requested
// rwidth x rheight, the placeholder the full width x height) and loaded again later.
// The retries run one after the other with a gap, so they stay within the rate limit
// and never start more than one preview generation at a time.
const RETRY_GAP_MS = 1500
const RETRY_MAX = 20
// a retried image that is out of view (loading="lazy") may not load at all - don't
// block the queue for it; it is checked again as soon as it loads
const RETRY_TIMEOUT_MS = 45000

const retryQueue = []
let retryActive = false

const runNextRetry = () => {
    const retry = retryQueue.shift()
    if (!retry) {
        retryActive = false
        return
    }
    retryActive = true
    setTimeout(() => {
        let finished = false
        const done = () => {
            if (!finished) {
                finished = true
                runNextRetry()
            }
        }
        setTimeout(done, RETRY_TIMEOUT_MS)
        retry(done)
    }, RETRY_GAP_MS)
}

const queueRetry = (retry) => {
    retryQueue.push(retry)
    if (!retryActive) {
        runNextRetry()
    }
}

export const isPlaceholder = (img, width, height) =>
    img.naturalWidth !== width || img.naturalHeight !== height

/**
 * Same as <img>, but reloads the image while it is a placeholder.
 * previewWidth / previewHeight: size of the real preview (rwidth / rheight of the url).
 * Without them it is a plain <img>.
 */
const PreviewImage = ({src, previewWidth, previewHeight, ...props}) => {
    const [attempt, setAttempt] = React.useState(0)
    const state = React.useRef({mounted: true, queued: false, done: null})

    const finish = () => {
        const s = state.current
        if (s.done) {
            const done = s.done
            s.done = null
            done()
        }
    }

    React.useEffect(() => () => {
        state.current.mounted = false
        finish()
    }, [])

    const onLoad = (e) => {
        finish()
        const s = state.current
        if (previewWidth && previewHeight && s.mounted && !s.queued && attempt < RETRY_MAX &&
            isPlaceholder(e.currentTarget, previewWidth, previewHeight)) {
            s.queued = true
            queueRetry((done) => {
                s.queued = false
                if (!s.mounted) {
                    done()
                    return
                }
                s.done = done
                setAttempt(a => a + 1)
            })
        }
    }

    // the api ignores unknown parameters - retry only makes the url unique,
    // so the browser loads it again
    return <img {...props}
                src={attempt ? src + (src.indexOf('?') >= 0 ? '&' : '?') + 'retry=' + attempt : src}
                onLoad={onLoad}
                onError={finish}/>
}

export default PreviewImage
