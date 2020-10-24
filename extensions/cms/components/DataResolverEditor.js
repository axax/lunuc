import React from 'react'
import CodeEditor from 'client/components/CodeEditor'
import {BuildIcon} from 'ui/admin'

class DataResolverEditor extends React.Component {

    render() {
        return <CodeEditor showFab actions={[{
                name: 'Create example',
                icon: <BuildIcon />,
                onClick: this.createExample.bind(this)
            }]} lineNumbers controlled type="json" {...this.props}/>
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
        ], null, 2), true)
    }
}


export default DataResolverEditor

