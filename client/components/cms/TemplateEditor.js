import React from 'react'
import ContentEditable from '../generic/ContentEditable'
import {Typography, SimpleMenu, ExpansionPanel} from 'ui/admin'

class TemplateEditor extends React.Component {
    render() {
        const {...rest} = this.props

        return <ExpansionPanel heading={<Typography variant="headline">Template</Typography>}>


            <SimpleMenu mini fab color="secondary" style={{position: 'absolute', bottom: '8px', right: '8px'}}
                        items={[{name: 'Prettify', onClick: this.prettify.bind(this)}]}/>


            <ContentEditable highlight="json" setHtml={false} {...rest}/>
        </ExpansionPanel>
    }

    prettify() {
        const {onBlur, children} = this.props
        if (children.trim() === '') return

        try {
            const j = eval('(' + children + ')');
            if (j.constructor === Array || j.constructor === Object) {
                onBlur(JSON.stringify(j, null, 2))
            }
        } catch (e) {
            console.error(e)
        }
    }
}


export default TemplateEditor

