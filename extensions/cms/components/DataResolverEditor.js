import React from 'react'
import {BuildIcon} from 'ui/admin'
import {jsonPropertyTemplates, jsonTemplates} from './templates/dataResolver'
import Async from '../../../client/components/Async'

const CodeEditor = (props) => <Async {...props} load={import(/* webpackChunkName: "codeeditor" */ '../../../client/components/CodeEditor')}/>

class DataResolverEditor extends React.Component {

    render() {
        return <CodeEditor showFab
                           templates={jsonTemplates}
                           propertyTemplates={jsonPropertyTemplates}
                           actions={[{
                               name: 'Create example',
                               icon: <BuildIcon/>,
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

