import React from 'react'
import ContentEditable from '../generic/ContentEditable'
import {Typography, ExpansionPanel} from 'ui/admin'

class ScriptEditor extends React.Component {
    render(){
        const {...rest} = this.props

        return <ExpansionPanel heading={<Typography variant="headline">Script</Typography>}>
            <ContentEditable highlight="js" {...rest}/>
        </ExpansionPanel>
    }
}


export default ScriptEditor

