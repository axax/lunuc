import React from 'react'
import PropTypes from 'prop-types'
import {SimpleMenu} from 'ui/admin'
import {UnControlled as CodeMirror} from 'react-codemirror2'
import './codemirror/javascript'
import './codemirror/search'
import 'codemirror/addon/display/rulers'
import 'codemirror/mode/htmlmixed/htmlmixed'
import 'codemirror/addon/hint/javascript-hint'
import 'codemirror/addon/hint/show-hint'
import 'codemirror/lib/codemirror.css'
import 'codemirror/addon/hint/show-hint.css'
import './codemirror/style.css'
import './codemirror/dialog.css'

/* linter */
/*import 'codemirror/addon/lint/lint'
import 'codemirror/addon/lint/json-lint'
import 'codemirror/addon/lint/lint.css'
import '../../node_modules/jshint/dist/jshint';
*/

/* Code Folding */
import 'codemirror/addon/fold/foldcode'
import 'codemirror/addon/fold/foldgutter'
import 'codemirror/addon/fold/brace-fold'
import 'codemirror/addon/fold/xml-fold'
import 'codemirror/addon/fold/indent-fold'
import 'codemirror/addon/fold/markdown-fold'
import 'codemirror/addon/fold/comment-fold'
import 'codemirror/addon/fold/foldgutter.css'

//https://codemirror.net/doc/manual.html#addon_rulers
class CodeEditor extends React.Component {


    constructor(props) {
        super(props)
        this._data = props.children
        this.state = {
            data: props.children,
            stateError: false,
            error: props.error
        }
    }

    static getDerivedStateFromProps(nextProps, prevState) {
        if (nextProps.children !== prevState.data || nextProps.error !== prevState.error) {
            console.log('CodeEditor update state')
            return {
                data: nextProps.children,
                stateError: false,
                error: nextProps.error
            }
        }
        return null
    }

    shouldComponentUpdate(nextProps, nextState) {
        this._refresh = false
        if (nextState.data !== this._data) {
            this._data = nextState.data
            this._refresh = true
        }
        return this._refresh || nextState.stateError !== this.state.stateError || nextState.error !== this.state.error
    }

    autoFormatSelection() {
        const {type,onChange} = this.props

        if (type === 'json') {
            try {
                this._data = JSON.stringify(JSON.parse(this._data),null, 2)

                if (onChange) {
                   onChange(this._data)
                }
                const scrollInfo = this._editor.getScrollInfo()
                this._editor.setValue(this._data)
                this._editor.scrollTo(scrollInfo.left, scrollInfo.top)


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
        const {onChange, onBlur, onScroll, error, onError, readOnly, lineNumbers, type, actions, showFab, style, fabButtonStyle, className, scrollPosition} = this.props
        const {stateError} = this.state
        const options = {
            mode: {},
            readOnly,
            lineNumbers,
            tabSize: 2,
            foldGutter:true,
            lint: true,
            gutters: ['CodeMirror-lint-markers', 'CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
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


            const rulers = []
            for (let i = 1; i <= 30; i++) {
                rulers.push({color: 'rgba(0,0,0,0.05)', column: i * 2, lineStyle: "dashed"})
            }

            options.rulers = rulers
        }


        const allActions = [{name: 'Format selection (Ctrl-L)', onClick: this.autoFormatSelection.bind(this)}]

        if (actions) {
            allActions.push(...actions)
        }

        console.log('render CodeEditor', fabButtonStyle)
        const baseStyle = {height: '25rem'}

        if (error || stateError) {
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
                        onBlur(e, this._data)
                    }
                }}
                onChange={(editor, dataObject, data) => {
                    if( this._refresh ) {
                        // initial onchange
                        this._refresh = false
                        return
                    }
                    if (this._data && (this._data.constructor === Object || this._data.constructor === Array)) {
                        // if input was Object output is an Object to
                        try {
                            this.setState({stateError: false})
                            this._data = JSON.parse(data)
                        } catch (e) {
                            console.error(e)
                            if (onError) {
                                onError(e)
                            }
                            this.setState({stateError: `Fehler in der JSON Struktur: ${e.message}`})
                            return
                        }
                    } else {
                        this._data = data
                    }
                    if (onChange) {
                        onChange(this._data)
                    }

                }}
            />{(error || stateError) && <div style={{color: 'red'}}>{error?error + ' ':''}{stateError?stateError:''}</div>}</div>
    }
}


CodeEditor.propTypes = {
    lineNumbers: PropTypes.bool,
    readOnly: PropTypes.bool,
    onChange: PropTypes.func,
    error: PropTypes.any,
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

