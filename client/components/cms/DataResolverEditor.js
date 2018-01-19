import React from 'react'
import ContentEditable from '../generic/ContentEditable'
import {Typography, SimpleMenu} from 'ui'

class DataResolverEditor extends React.Component {
    render(){
        const {...rest} = this.props

        return <div style={{position:'relative'}}>
            <Typography type="headline">Data resolver</Typography>


            <SimpleMenu style={{position:'absolute',bottom:'8px',right:'8px'}}
                        items={[{name:'Prettify', onClick:this.prettify.bind(this)}]}/>


            <ContentEditable {...rest}/>
        </div>
    }

    prettify(){
        const {onChange, children} = this.props

        try {
            const j = eval('(' + children + ')');
            if( j.constructor === Array ) {
                onChange(JSON.stringify(j,null,4))
            }
        }catch(e){
            console.error(e)
        }
    }
}


export default DataResolverEditor

