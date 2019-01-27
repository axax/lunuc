import React from 'react'
import ContentEditable from 'client/components/ContentEditable'
import {SimpleMenu, BuildIcon} from 'ui/admin'

class DataResolverEditor extends React.Component {

    render() {
        const {...rest} = this.props
        return <div style={{position: 'relative'}}>
            <SimpleMenu key="dataResolverMenu" mini fab color="secondary"
                        style={{position: 'absolute', bottom: '-8px', right: '-8px'}}
                        items={[{name: 'Prettify', onClick: this.prettify.bind(this)}, {
                            name: 'Create example',
                            icon: <BuildIcon />,
                            onClick: this.createExample.bind(this)
                        }]}/>
            <ContentEditable key="dataResolverEditor" l="dataResolverEditor" highlight="json" {...rest}/>
        </div>
    }

    prettify() {
        const {onBlur, children} = this.props
        if (children.trim() === '') return

        try {
            const j = eval('(' + children + ')');
            if (j.constructor === Array) {
                onBlur(JSON.stringify(j, null, 2))
            }
        } catch (e) {
            console.error(e)
        }
    }

    createExample() {
        const {onBlur} = this.props


        onBlur(JSON.stringify([
            {
                "t": "$Word",
                "d": [
                    "de",
                    "en"
                ],
                "l": 20,
                "o": 0
            }
        ], null, 2))
    }
}


export default DataResolverEditor

