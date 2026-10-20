import React, {useState, useEffect, useRef} from 'react'
import DomUtil from '../../../client/util/dom.mjs'
import config from 'gen/config-client'
import {getGraphQlWsUrl, getGraphQlUrl} from '../../../client/middleware/graphql'

/*
 * Renders a JsonDom in an iframe (own document, own styles). The bundle is loaded once per iframe,
 * a new jsonDom (e.g. another revision) is rendered into the same document - no reload, the scroll
 * position stays.
 */
const JsonDomIFrame = ({
                           jsonDom,
                           ...props
                       }) => {
    const [contentRef, setContentRef] = useState(null)
    const latestJsonDom = useRef(jsonDom)
    const loadedWin = useRef(null)
    latestJsonDom.current = jsonDom

    // load the bundle once the iframe exists
    useEffect(() => {
        const win = contentRef && contentRef.contentWindow
        if (!win || !win.document || !win.document.body) {
            return
        }
        win._app_ = {
            start: new Date(),
            renderApp: false,
            installServiceWorker: false,
            graphqlOptions: {
                url: getGraphQlUrl(),
                wsUrl: getGraphQlWsUrl()
            },
            history: jsonDom.history
        }
        DomUtil.addScript(`/main.bundle.js?v=${config.BUILD_NUMBER}`, {
            id: 'main',
            onload: () => {
                if (win._app_.JsonDom) {
                    loadedWin.current = win
                    win._app_.JsonDom.render(latestJsonDom.current)
                    win.document.addEventListener('click', (e) => {
                        e.stopPropagation()
                        e.preventDefault()
                    })
                }
            }
        }, {ignoreIfExist: true, document: win.document})
    }, [contentRef])

    // render a changed jsonDom into the already loaded document
    useEffect(() => {
        const win = loadedWin.current
        if (win && win._app_ && win._app_.JsonDom) {
            win._app_.JsonDom.render(jsonDom)
        }
    }, [jsonDom])

    return <iframe {...props} ref={setContentRef}/>
}


export default JsonDomIFrame
