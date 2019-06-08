import React from 'react'
import PropTypes from 'prop-types'
import {SimpleMenu} from 'ui/admin'
import {UnControlled as CodeMirror} from 'react-codemirror2'
import './codemirror/javascript'
import './codemirror/search'
import 'codemirror/mode/htmlmixed/htmlmixed'
import 'codemirror/addon/hint/javascript-hint'
import 'codemirror/addon/hint/show-hint'
import 'codemirror/lib/codemirror.css'
import 'codemirror/addon/hint/show-hint.css'
import './codemirror/style.css'
import './codemirror/dialog.css'


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
        if (nextState.data !== this._data) {
            this._data = nextState.data
            refresh = true
        }
        return refresh
    }

    autoFormatSelection() {
        const from = this._editor.getCursor(true), to = this._editor.getCursor(false)
        if (from !== to) {
            this._editor.autoFormatRange(from, to)
        }
    }

    render() {
        const {onChange, readOnly, lineNumbers, type, actions, showFab, style, fabButtonStyle, className} = this.props
        const options = {
            mode: {},
            readOnly,
            lineNumbers,
            tabSize: 2,
            indentWithTabs: true,
            /*  lineWrapping: false,
             matchBrackets: true,*/
            extraKeys: {
                'Ctrl-Space': 'autocomplete',
                'Ctrl-L': (cm) => {
                    this.autoFormatSelection()
                }
            },
        }

        if (['js', 'javascript', 'json'].indexOf(type) >= 0) {
            options.mode.name = 'javascript'
        } else if (type === 'html') {
            options.mode.name = 'htmlmixed'
        } else {
            options.mode.name = type
        }

        if (type === 'json') {
            options.mode.json = true
            options.indentWithTabs = false
            // repalce tabs with spaces
            options.extraKeys.Tab = (cm) => cm.execCommand('indentMore')
            options.extraKeys['Shift-Tab'] = (cm) => cm.execCommand('indentLess')
        }

        const allActions = [{name: 'Format selection (Ctrl-L)', onClick: this.autoFormatSelection.bind(this)}]

        if (actions) {
            allActions.push(...actions)
        }

        console.log('render CodeEditor', fabButtonStyle)
        return <div className={className} style={{height: '35rem', ...style}}>
            {showFab && <SimpleMenu key="menu" mini fab color="secondary" style={{
                zIndex: 999,
                position: 'absolute',
                bottom: '8px',
                right: '8px', ...fabButtonStyle
            }} items={allActions}/>}
            <CodeMirror
                key="editor"
                editorDidMount={editor => {
                    this._editor = editor
                    //  editor.setSize(width, height);
                }}
                value={this._data}
                options={options}
                onChange={(editor, dataObject, data) => {

                    this._data = data
                    if (onChange) {
                        onChange(data)
                    }
                }}
            /></div>
    }
}


CodeEditor.propTypes = {
    lineNumbers: PropTypes.bool,
    readOnly: PropTypes.bool,
    onChange: PropTypes.func,
    type: PropTypes.string,
    children: PropTypes.string,
    actions: PropTypes.array,
    showFab: PropTypes.bool,
    style: PropTypes.object,
    fabButtonStyle: PropTypes.object,
    className: PropTypes.string
}


export default CodeEditor

