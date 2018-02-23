import React from 'react'
import ContentEditable from '../generic/ContentEditable'
import {Typography, SimpleMenu} from 'ui/admin'

class DataResolverEditor extends React.Component {
    render(){
        const {...rest} = this.props

        return <div style={{position:'relative'}}>
            <Typography variant="headline">Data resolver</Typography>


            <SimpleMenu mini fab color="secondary" style={{position:'absolute',bottom:'8px',right:'8px'}}
                        items={[{name:'Prettify', onClick:this.prettify.bind(this)}]}/>


            <ContentEditable {...rest}/>
        </div>
    }

    prettify(){
        const {onChange, children} = this.props
        if( children.trim()==='' ) return

        try {
            const j = eval('(' + children + ')');
            if( j.constructor === Array ) {
                onChange(JSON.stringify(j,null,2))
            }
        }catch(e){
            console.error(e)
        }
    }
}


export default DataResolverEditor

