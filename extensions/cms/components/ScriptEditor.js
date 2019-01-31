import React from 'react'
import ContentEditable from 'client/components/ContentEditable'

class ScriptEditor extends React.Component {
    render(){
        const {...rest} = this.props

        return <ContentEditable lines highlight="js" {...rest}/>
    }
}


export default ScriptEditor

