import React from 'react'
import ContentEditable from 'client/components/ContentEditable'

class ScriptEditor extends React.Component {
    render(){
        const {...rest} = this.props

        return <ContentEditable highlight="js" {...rest}/>
    }
}


export default ScriptEditor

