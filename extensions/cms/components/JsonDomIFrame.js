import React, { useState } from 'react'
import DomUtil from '../../../client/util/dom.mjs'
import config from 'gen/config-client'
import {getGraphQlWsUrl, getGraphQlUrl} from '../../../client/middleware/graphql'

const JsonDomIFrame = ({
                           jsonDom,
                           ...props
                       }) => {
    const [contentRef, setContentRef] = useState(null)
    const mountNode =
        contentRef?.contentWindow?.document?.body

    if(mountNode){
        const win = contentRef.contentWindow
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
                if(win._app_.JsonDom) {
                    win._app_.JsonDom.render(jsonDom)
                    win.document.addEventListener('click', (e) => {
                        e.stopPropagation()
                        e.preventDefault()
                    })
                }
            }
        }, {ignoreIfExist: true, document: win.document})


        /*DomUtil.createAndAddTag('style', 'head', {
            textContent: `* {pointer-events: none !important}`,
            id: 'jsondomiframestyle'},
            { document: win.document})*/

    }
    return <iframe {...props} ref={setContentRef} />
}



export default JsonDomIFrame