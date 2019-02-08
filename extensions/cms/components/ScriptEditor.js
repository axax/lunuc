import React from 'react'
import CodeEditor from 'client/components/CodeEditor'

class ScriptEditor extends React.Component {
    render(){
        const {...rest} = this.props

        return <CodeEditor lineNumbers type="js" {...rest}/>
    }
}


export default ScriptEditor

