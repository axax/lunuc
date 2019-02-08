import React from 'react'
import CodeEditor from 'client/components/CodeEditor'
import {SimpleMenu, BuildIcon} from 'ui/admin'

class DataResolverEditor extends React.Component {

    render() {
        const {...rest} = this.props
        return <div style={{position: 'relative'}}>
            <SimpleMenu key="dataResolverMenu" mini fab color="secondary"
                        style={{zIndex:99,position: 'absolute', bottom: '-8px', right: '-8px'}}
                        items={[{name: 'Prettify', onClick: this.prettify.bind(this)}, {
                            name: 'Create example',
                            icon: <BuildIcon />,
                            onClick: this.createExample.bind(this)
                        }]}/>
            <CodeEditor lineNumbers type="json" {...rest}/>
        </div>
    }

    prettify() {
        const {onChange, children} = this.props
        if (children.trim() === '') return

        try {
            const j = eval('(' + children + ')');
            if (j.constructor === Array) {
                onChange(JSON.stringify(j, null, 2))
            }
        } catch (e) {
            console.error(e)
        }
    }

    createExample() {
        const {onChange} = this.props


        onChange(JSON.stringify([
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

