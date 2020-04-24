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
            data: props.children,
            error: false
        }
    }

    static getDerivedStateFromProps(nextProps, prevState) {
        if (nextProps.children !== prevState.data) {
            console.log('CodeEditor update state')
            return {
                data: nextProps.children,
                error: false
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
        return refresh || nextState.error !== this.state.error
    }

    autoFormatSelection() {
        const {type,onChange} = this.props

        if (type === 'json') {
            try {
                const parsedJson = JSON.parse(this._data)

                if (onChange) {
                   onChange(JSON.stringify(parsedJson, null, 2))
                }

                return
            } catch (e) {

            }
        }

        const from = this._editor.getCursor(true), to = this._editor.getCursor(false)
        if (from !== to) {
            this._editor.autoFormatRange(from, to)
        }
    }

    render() {
        const {onChange, onBlur, onScroll, onError, readOnly, lineNumbers, type, actions, showFab, style, fabButtonStyle, className, scrollPosition} = this.props
        const {error} = this.state
        const options = {
            mode: {},
            readOnly,
            lineNumbers,
            tabSize: 2,
            indentWithTabs: true,
            autoClearEmptyLines:false,
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
        const baseStyle = {height: '25rem'}

        if (error) {
            baseStyle.border = 'solid 1px red'
        }
        return <div className={className} style={{...baseStyle, ...style}}>
            {showFab && <SimpleMenu key="menu" mini fab color="secondary" style={{
                zIndex: 999,
                position: 'absolute',
                bottom: '8px',
                right: '8px', ...fabButtonStyle
            }} items={allActions}/>}
            <CodeMirror
                autoCursor={false}
                key="editor"
                editorDidMount={editor => {
                    this._editor = editor
                    if (scrollPosition) {
                        editor.scrollTo(scrollPosition.left, scrollPosition.top)
                    }
                    //  editor.setSize(width, height);
                }}
                value={this._data && (this._data.constructor === Object || this._data.constructor === Array) ? JSON.stringify(this._data, null, 2) : this._data}
                options={options}
                onScroll={(editor, e) => {
                    if (onScroll) {
                        onScroll(e)
                    }
                }}
                onBlur={(editor, e) => {
                    if (onBlur) {
                        onBlur(e)
                    }
                }}
                onChange={(editor, dataObject, data) => {
                    if (this._data && (this._data.constructor === Object || this._data.constructor === Array)) {
                        // if input was Object output is an Object to
                        try {
                            this.setState({error: false})
                            this._data = JSON.parse(data)
                        } catch (e) {
                            console.error(e)
                            if (onError) {
                                onError(e)
                            }
                            this.setState({error: `Fehler in der JSON Struktur: ${e.message}`})
                            return
                        }
                    } else {
                        this._data = data
                    }
                    if (onChange) {
                        onChange(this._data)
                    }

                }}
            />{error && <div style={{color: 'red'}}>{error}</div>}</div>
    }
}


CodeEditor.propTypes = {
    lineNumbers: PropTypes.bool,
    readOnly: PropTypes.bool,
    onChange: PropTypes.func,
    onError: PropTypes.func,
    onScroll: PropTypes.func,
    onBlur: PropTypes.func,
    type: PropTypes.string,
    children: PropTypes.any,
    actions: PropTypes.array,
    showFab: PropTypes.bool,
    style: PropTypes.object,
    fabButtonStyle: PropTypes.object,
    className: PropTypes.string,
    scrollPosition: PropTypes.object
}


export default CodeEditor

