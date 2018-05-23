import React from 'react'
import ContentEditable from '../generic/ContentEditable'
import Expandable from './Expandable'

class ScriptEditor extends React.Component {
    render(){
        const {...rest} = this.props

        return <Expandable title="Script">
            <ContentEditable highlight="js" {...rest}/>
        </Expandable>
    }
}


export default ScriptEditor

