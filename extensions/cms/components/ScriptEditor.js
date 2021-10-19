import React from 'react'
import Async from '../../../client/components/Async'

const CodeEditor = (props) => <Async {...props} load={import(/* webpackChunkName: "codeeditor" */ '../../../client/components/CodeEditor')}/>

class ScriptEditor extends React.Component {
    render(){
        const {...rest} = this.props
        return <CodeEditor fileSplit showFab lineNumbers type="customJs" {...rest}/>
    }
}


export default ScriptEditor

