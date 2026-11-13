import React, {useEffect, useRef, useState} from 'react'
import config from 'gen/config-client'
import {mediaIdFromValue} from '../util/excel.mjs'

/*
 * Cms component HtmlEmbed (element «iFrame» in extensions/cms/util/elements/baseElements.mjs, used instead of
 * a plain iframe when a html file is chosen):
 * shows a static html page (Media, e.g. an interactive chart with its own css and js) in a sandboxed iframe.
 *
 * - isolation: own document -> the css of the page and of the site don't mix
 * - security: sandbox without allow-same-origin -> opaque origin, the scripts of the page run but can't access
 *   cookies, the api or the session of the visitor (same rules as uploads served by server/util/file.mjs)
 * - height: the html is loaded and passed as srcdoc with a small script that reports its height via postMessage,
 *   so the iframe grows with the content (no scrollbar). Without srcdoc (IE11) the file is loaded via src with a fixed height.
 *
 * props: media (Media value or id), height (fixed height, e.g. "600px", empty = automatic), width, title
 * (src and frameBorder of the iframe element are ignored)
 */

const SANDBOX = 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads'
const MESSAGE_PREFIX = 'lunucHtmlEmbedHeight:'
const DEFAULT_HEIGHT = 300

// ES5, runs inside the embedded page
const HEIGHT_SCRIPT = '<script>(function(){var last=-1;function send(){var d=document.documentElement;' +
    'var h=Math.ceil(d.getBoundingClientRect().height);if(h!==last){last=h;parent.postMessage(\'' + MESSAGE_PREFIX + '\'+h,\'*\')}}' +
    'if(window.ResizeObserver){new ResizeObserver(send).observe(document.documentElement)}else{setInterval(send,500)}' +
    'window.addEventListener(\'load\',send);send()})()</script>'

const injectHeightScript = html => {
    const idx = html.toLowerCase().lastIndexOf('</body>')
    return idx >= 0 ? html.substring(0, idx) + HEIGHT_SCRIPT + html.substring(idx) : html + HEIGHT_SCRIPT
}

const mediaUrl = media => {
    const id = mediaIdFromValue(media)
    if (!id) {
        return ''
    }
    const entry = Array.isArray(media) ? media[0] : media
    const name = entry && entry.name ? entry.name : 'page.html'
    return config.UPLOAD_URL + '/' + id + '/-/' + encodeURIComponent(name)
}

let srcdocSupport
const supportsSrcdoc = () => {
    if (srcdocSupport === undefined) {
        srcdocSupport = typeof document !== 'undefined' && 'srcdoc' in document.createElement('iframe')
    }
    return srcdocSupport
}

// eslint-disable-next-line no-unused-vars
export default function HtmlEmbed({media, src, frameBorder, height, width, title, className, style, children, _editmode, ...rest}) {
    const url = mediaUrl(media)
    const fixedHeight = height ? (isNaN(height) ? height : height + 'px') : ''
    const iframeRef = useRef(null)
    const [autoHeight, setAutoHeight] = useState(DEFAULT_HEIGHT)
    const [error, setError] = useState('')
    // the inline editor passes _inlineeditor -> cover the iframe so the element can be selected / edited
    const editMode = !!_editmode || rest._inlineeditor !== undefined

    // load the html and pass it as srcdoc (set on the dom node, the string is not diffed by react)
    useEffect(() => {
        const iframe = iframeRef.current
        if (!url || !iframe || !supportsSrcdoc()) {
            return
        }
        let active = true
        setError('')
        fetch(url).then(response => {
            if (!response.ok) {
                throw new Error(response.status + ' ' + response.statusText)
            }
            return response.text()
        }).then(html => {
            if (active) {
                iframe.srcdoc = fixedHeight ? html : injectHeightScript(html)
            }
        }).catch(e => active && setError(e.message))
        return () => {
            active = false
        }
    }, [url, fixedHeight])

    // height reported by the embedded page; only messages of this iframe are accepted
    useEffect(() => {
        if (fixedHeight || !url) {
            return
        }
        const onMessage = e => {
            const iframe = iframeRef.current
            if (iframe && e.source === iframe.contentWindow && typeof e.data === 'string' && e.data.indexOf(MESSAGE_PREFIX) === 0) {
                const h = parseInt(e.data.substring(MESSAGE_PREFIX.length))
                if (h > 0) {
                    setAutoHeight(h)
                }
            }
        }
        window.addEventListener('message', onMessage)
        return () => window.removeEventListener('message', onMessage)
    }, [url, fixedHeight])

    const wrapperClass = 'html-embed' + (className ? ' ' + className : '')

    if (!url) {
        return <div className={wrapperClass} style={style} {...rest}>
            <p className="html-embed__message">Keine HTML-Datei gewählt</p>{children}
        </div>
    }

    // without srcdoc (IE11, ssr) the file is loaded directly, it is served sandboxed by the server as well
    const useSrc = typeof window !== 'undefined' && !supportsSrcdoc()

    return <div className={wrapperClass} style={Object.assign({position: 'relative'}, style)} {...rest}>
        <iframe ref={iframeRef}
                src={useSrc ? url : undefined}
                sandbox={SANDBOX}
                title={title || (Array.isArray(media) && media[0] && media[0].name) || 'HTML'}
                loading="lazy"
                style={{display: 'block', width: width ? (isNaN(width) ? width : width + 'px') : '100%', maxWidth: '100%', border: 0, height: fixedHeight || (useSrc ? DEFAULT_HEIGHT * 2 : autoHeight) + 'px'}}/>
        {error && <p className="html-embed__message html-embed__message--error">{error}</p>}
        {editMode && <div style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0}}/>}
        {children}
    </div>
}
