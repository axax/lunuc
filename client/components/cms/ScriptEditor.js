import React from 'react'
import ContentEditable from '../generic/ContentEditable'
import {Typography} from 'ui/admin'

class ScriptEditor extends React.Component {
    render(){
        const {...rest} = this.props

        return <div>
            <Typography type="headline">Script</Typography>

            <ContentEditable {...rest}/>
        </div>
    }
}


export default ScriptEditor

