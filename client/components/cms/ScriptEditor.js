import React from 'react'
import ContentEditable from '../generic/ContentEditable'
import {Typography} from 'ui/admin'

class ScriptEditor extends React.Component {
    render(){
        const {...rest} = this.props

        return <div>
            <Typography variant="headline">Script</Typography>

            <ContentEditable highlight="js" {...rest}/>
        </div>
    }
}


export default ScriptEditor

