import React from 'react'
import ContentEditable from '../generic/ContentEditable'
import {Typography, SimpleMenu} from 'ui/admin'

class TemplateEditor extends React.Component {
    render(){
        const {...rest} = this.props

        return <div style={{position:'relative'}}>
            <Typography type="headline">Template</Typography>


            <SimpleMenu mini fab color="secondary" style={{position:'absolute',bottom:'8px',right:'8px'}}
                        items={[{name:'Prettify', onClick:this.prettify.bind(this)}]}/>


            <ContentEditable {...rest}/>
        </div>
    }

    prettify(){
        const {onBlur, children} = this.props
        if( children.trim()==='' ) return

        try {
            const j = eval('(' + children + ')');
            if( j.constructor === Array ) {
                onBlur(JSON.stringify(j,null,4))
            }
        }catch(e){
            console.error(e)
        }
    }
}


export default TemplateEditor

