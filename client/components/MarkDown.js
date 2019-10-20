import React, { useState } from 'react'
import markdown from 'util/markdown'


function MarkDown({children}) {

    if( !children)
        return null

    // Declare a new state variable, which we'll call "count"
    const [count, setCount] = useState(0)
    const startTime = new Date()
    const html = markdown(children.replace(/\\n/g,'\n'))
    console.info(`render markdown in ${new Date() - startTime}ms`)

    return (<div
            dangerouslySetInnerHTML={{__html: html}}/>
    )
}

export default MarkDown
