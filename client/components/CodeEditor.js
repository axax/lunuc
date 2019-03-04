import React from 'react'
import PropTypes from 'prop-types'
import {UnControlled as CodeMirror} from 'react-codemirror2'
import './codemirror/javascript'
import 'codemirror/mode/htmlmixed/htmlmixed'
import 'codemirror/addon/hint/javascript-hint'
import 'codemirror/addon/hint/show-hint'
import 'codemirror/lib/codemirror.css'
import 'codemirror/addon/hint/show-hint.css'
import './codemirror/style.css'


class CodeEditor extends React.Component {


    constructor(props) {
        super(props)
        this._data = props.children
        this.state = {
            data: props.children
        }
    }

    static getDerivedStateFromProps(nextProps, prevState) {
        if (nextProps.children !== prevState.data) {
            console.log('CodeEditor update state')
            return {
                data: nextProps.children
            }
        }
        return null
    }

    shouldComponentUpdate(nextProps, nextState) {
        let refresh = false
        if( nextState.data !== this._data){
            this._data = nextState.data
            refresh =true
        }
        return refresh
    }


    render() {
        const {onChange, readOnly, lineNumbers, type} = this.props
        const options = {
            mode: {},
            readOnly,
            lineNumbers,
            indentWithTabs: true,
            /*  lineWrapping: false,
             matchBrackets: true,*/
            extraKeys: {'Ctrl-Space': 'autocomplete'}
        }

        if (['js', 'javascript', 'json'].indexOf(type) >= 0) {
            options.mode.name = 'javascript'
        }else if( type === 'html'){
            options.mode.name = 'htmlmixed'
        }else{
            options.mode.name = type
        }

        if (type === 'json') {
            options.mode.json = true
            options.indentWithTabs = false
            // repalce tabs with spaces
            options.extraKeys = {
                Tab: (cm) => cm.execCommand('indentMore'),
                'Shift-Tab': (cm) => cm.execCommand('indentLess')
            }
        }

        console.log('render CodeEditor')
        return <CodeMirror
            value={this._data}
            options={options}
            onChange={(editor, dataObject, data) => {

                this._data = data
                if (onChange) {
                    onChange(data)
                }
            }}
        />
    }
}


CodeEditor.propTypes = {
    lineNumbers: PropTypes.bool,
    readOnly: PropTypes.bool,
    onChange: PropTypes.func,
    type: PropTypes.string
}


export default CodeEditor

