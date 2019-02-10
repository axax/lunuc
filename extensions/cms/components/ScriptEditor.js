import React from 'react'
import CodeEditor from 'client/components/CodeEditor'

class ScriptEditor extends React.Component {
    render(){
        const {...rest} = this.props

        return <CodeEditor lineNumbers type="customJs" {...rest}/>
    }
}


export default ScriptEditor

