import React, {useState, useRef, useEffect, createPortal} from 'react'
import {openWindow} from '../../util/window'

function copyStyles(sourceDoc, targetDoc) {
    Array.from(sourceDoc.styleSheets).forEach(styleSheet => {
        try {
            if (styleSheet.cssRules) { // true for inline styles
                const newStyleEl = targetDoc.createElement('style')

                Array.from(styleSheet.cssRules).forEach(cssRule => {
                    newStyleEl.appendChild(targetDoc.createTextNode(cssRule.cssText))
                })

                targetDoc.head.appendChild(newStyleEl)
            } else if (styleSheet.href) { // true for stylesheets loaded from a URL
                const newLinkEl = targetDoc.createElement('link')

                newLinkEl.rel = 'stylesheet'
                newLinkEl.href = styleSheet.href
                targetDoc.head.appendChild(newLinkEl)
            }
        }catch (e) {
            console.log(e, styleSheet)
        }
    })
}

const RenderInNewWindow = (props) => {
    const [container, setContainer] = useState(null)
    const newWindow = useRef(null)

    useEffect(() => {
        // Create container element on client-side
        setContainer(document.createElement("div"));
    }, []);

    useEffect(() => {
        // When container is ready
        if (container) {
            // Create window


            newWindow.current = openWindow({url:''})


            // Save reference to window for cleanup
            const curWindow = newWindow.current


            // Append container
            curWindow.document.body.appendChild(container)

            curWindow.document.title = props.title || ''


            copyStyles(document, curWindow.document)


            curWindow.addEventListener('beforeunload',()=>{
                if(props.onClose){
                    props.onClose()
                }
            })

            // Return cleanup function
            return () => curWindow.close()
        }
    }, [container])

    return container && createPortal(props.children, container)
}


export default RenderInNewWindow
