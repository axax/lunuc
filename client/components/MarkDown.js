import React, { useState } from 'react'
import markdown from 'util/markdown'

//expose
_app_.markdownParser = markdown

function MarkDown({children, className, id}) {

    if( !children)
        return null

    // Declare a new state variable, which we'll call "count"
    const [count, setCount] = useState(0)
    const startTime = new Date()
    const html = markdown(children.replace(/\\n/g,'\n'))
    console.info(`render markdown in ${new Date() - startTime}ms`)

    return (<div id={id} className={className}
            dangerouslySetInnerHTML={{__html: html}}/>
    )
}

export default MarkDown
