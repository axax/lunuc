import React, { useMemo } from 'react'
import markdown from 'util/markdown'

//expose
_app_.markdownParser = markdown

function MarkDown({children, className, id}) {

     // nur neu rendern, wenn sich der Inhalt (children) ändert.
     // Hook muss unbedingtaufrufen werden (Rules of Hooks), daher kein
     // early return davor.
    const html = useMemo(() => {
        if (!children) return null
        const startTime = new Date()
        const result = markdown(children.replace(/\\n/g,'\n'))
        console.info(`render markdown in ${new Date() - startTime}ms`)
        return result
     }, [children])

    if (!html)
        return null

    return (<div id={id} className={className}
            dangerouslySetInnerHTML={{__html: html}}/>
      )
}

export default MarkDown
