import React from 'react'
import PropTypes from 'prop-types'
import {SimpleMenu, SimpleDialog, ViewListIcon, LaunchIcon, EditIcon, CodeIcon} from 'ui/admin'
import {withStyles} from '@material-ui/core/styles'
import classNames from 'classnames'

import {UnControlled as UnControlledCodeMirror} from 'react-codemirror2'
import CodeMirror from 'codemirror'
import './codemirror/javascript'
import './codemirror/search'
import 'codemirror/addon/display/rulers'
import 'codemirror/mode/htmlmixed/htmlmixed'
import 'codemirror/addon/hint/javascript-hint'
import 'codemirror/addon/hint/show-hint'
import 'codemirror/addon/hint/css-hint'
import 'codemirror/lib/codemirror.css'
import './codemirror/style.css'
import './codemirror/dialog.css'
import './codemirror/hint.css'
//import 'codemirror/theme/material-ocean.css'

/* linter */
//import 'codemirror/addon/lint/json-lint'
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
import GenericForm from './GenericForm'
import Util from '../util'

const styles = theme => ({
    root: {
        display: 'flex',
        flexDirection: 'column'
    },
    rootError: {
        border: 'solid 1px red'
    },
    codemirror: {
        height: '30rem'
    },
    files: {},
    file: {
        display: 'inline-block',
        padding: '0.5rem',
        background: '#efefef',
        borderRadius: '0.1rem',
        cursor: 'pointer',
        '&:hover': {
            background: '#aaa'
        }
    },
    fileActive: {
        background: '#aaa'
    }
})


const snippets = {
    'customJs': [
        {text: "on(['resourcesready'],()=>{})", displayText: 'on resourcesready event'},
        {text: `on(['mount'],()=>{
            DomUtil.waitForElement('.selector').then(()=>{})
        })`, displayText: 'on mount event'},
    ]
}

function getFirstLine(text) {
    let index = text.indexOf('\n')
    if (index === -1) index = undefined
    return text.substring(0, index)
}


//https://codemirror.net/doc/manual.html#addon_rulers
class CodeEditor extends React.Component {

    constructor(props) {
        super(props)
        this.state = CodeEditor.getStateFromProps(props)
    }

    static getStateFromProps(props) {
        const isDataJson = props.children && (props.children.constructor === Object || props.children.constructor === Array)

        let data = props.children

        if (isDataJson) {
            data = JSON.stringify(data, null, 2)
        }

        return {
            data,
            isDataJson,
            stateError: false,
            error: props.error,
            fileIndex: props.fileIndex || 0,
            showFileSplit: true,
            stateDate: new Date()
        }
    }

    static getDerivedStateFromProps(nextProps, prevState) {
        if (!!nextProps.error !== !!prevState.error || (!prevState._stateUpdate && !prevState.stateError && nextProps.controlled && nextProps.children !== prevState.data)) {
            console.log(nextProps.error,prevState.error)

            console.log('CodeEditor update state')
            return CodeEditor.getStateFromProps(nextProps, prevState)
        }
        return {...prevState, _stateUpdate:false}
    }

    setState(state, callback) {
        state._stateUpdate=true
        super.setState(state,callback)

    }

    shouldComponentUpdate(nextProps, nextState) {
        return nextState.stateError !== this.state.stateError ||
            nextState.stateDate !== this.state.stateDate ||
            nextState.error !== this.state.error ||
            nextState.fileIndex !== this.state.fileIndex ||
            nextState.showContextMenu !== this.state.showContextMenu ||
            nextState.editData !== this.state.editData ||
            nextState.showFileSplit !== this.state.showFileSplit
    }

    autoFormatSelection() {
        const {type, onChange} = this.props

        if (type === 'json') {
            try {
                const formatedData = JSON.stringify(JSON.parse(this.state.data), null, 2)

                if (onChange) {
                    onChange(formatedData)
                }
                const scrollInfo = this._editor.getScrollInfo()
                this._editor.setValue(formatedData)
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


    snippet() {
        const mode = this._editor.options.mode.name
        if (snippets[mode]) {
            CodeMirror.showHint(this._editor, () => {
                const cursor = this._editor.getCursor()
                const token = this._editor.getTokenAt(cursor)
                const start = token.start
                const end = cursor.ch
                const line = cursor.line
                const currentWord = token.string

                const list = snippets[mode].filter((item) => {
                    return item.text.indexOf(currentWord) >= 0
                })
                return {
                    list: list.length ? list : snippets[mode],
                    from: CodeMirror.Pos(line, start),
                    to: CodeMirror.Pos(line, end)
                }
            }, {completeSingle: false})
        }
    }


    render() {
        const {height, onFileChange, onChange, onBlur, onScroll, error, onError, readOnly, lineNumbers, type, actions, showFab, style, fabButtonStyle, className, scrollPosition, fileSplit, classes} = this.props
        const {stateError, showFileSplit, fileIndex, showContextMenu, editData, data} = this.state

        const options = {
            mode: {},
           /* theme: 'material-ocean',*/
            historyEventDelay:1250,
            readOnly,
            lineNumbers,
            tabSize: 2,
            foldGutter: true,
            lint: false,
            gutters: ['CodeMirror-lint-markers', 'CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
            indentWithTabs: false,
            smartIndent:true,
            autoClearEmptyLines: false,
            lineWrapping: false,
            /*  lineWrapping: false,
             matchBrackets: true,*/
            extraKeys: {
                'Ctrl-E': () => {
                    this.snippet()
                },
                'Ctrl-Space': 'autocomplete',
                'Ctrl-L': (cm) => {
                    this.autoFormatSelection()
                }
            },
            hintOptions: {
                completeSingle: false,
            }
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


        const allActions = [
            {
                icon: <ViewListIcon/>,
                name: 'Format selection (Ctrl-L)',
                onClick: this.autoFormatSelection.bind(this)
            },
            {
                icon: <LaunchIcon/>,
                name: 'Open in new window',
                onClick: () => {
                    alert('todo')
                }
            },
        ]

        if (actions) {
            allActions.push(...actions)
        }

        console.log('render CodeEditor')
        let value = data
        if (!value) {
            value = ''
        }
        let files, filenames, finalFileIndex
        if (fileSplit) {

            if (showFileSplit) {
                files = value.split('\n//!#')
                if (files.length > 1) {
                    filenames = []

                    files.forEach((file, i) => {
                        if (i === 0) {
                            if (value.indexOf('//!#') === 0) {
                                files[i] = files[i].substring(files[i].indexOf('\n') + 1)
                                filenames.push(getFirstLine(value).substring(4))
                            } else {
                                filenames.push('main')
                            }
                        } else {
                            files[i] = files[i].substring(files[i].indexOf('\n') + 1)
                            filenames.push(getFirstLine(file))
                        }
                    })

                    if (fileIndex >= files.length) {
                        finalFileIndex = 0
                    } else {
                        finalFileIndex = fileIndex
                    }

                    value = files[finalFileIndex]
                }
            }

            allActions.push({
                name: (showFileSplit ? 'Hide' : 'Show') + ' File split', onClick: () => {
                    this.setState({showFileSplit: !showFileSplit})
                }
            })
        }

        let contextMenuItems

        if (showContextMenu) {
            const loc = this._editor.coordsChar(showContextMenu,'window')
            this._lineNr = loc.line

            let line = this._editor.doc.getLine(loc.line)

            this._endsWithComma = line.endsWith(',')
            if (this._endsWithComma) {
                line = line.substring(0, line.length - 1)
            }
            try {

                const tempJson = JSON.parse('{' + line + '}')
                contextMenuItems = [
                    {
                        icon: <EditIcon/>,
                        name: 'Edit as Text',
                        onClick: () => {
                            const keys = Object.keys(tempJson)
                            if (keys.length > 0) {
                                this.setState({editData: {uitype: 'textarea', key: keys[0], value: tempJson[keys[0]]}})
                            }
                        }
                    },
                    {
                        icon: <CodeIcon/>,
                        name: 'Edit as HTML',
                        onClick: () => {
                            const keys = Object.keys(tempJson)
                            if (keys.length > 0) {
                                this.setState({editData: {uitype: 'html', key: keys[0], value: tempJson[keys[0]]}})
                            }
                        }
                    }
                ]
            } catch (e) {
            }
        }
        return <div className={classNames(classes.root, (error || stateError) && classes.rootError, className)}
                    style={{style}}>


            {editData && <SimpleDialog fullWidth={true} maxWidth="md" key="newSiteDialog" open={true}
                                       onClose={(e) => {

                                           let newData = value
                                           if (e.key === 'ok') {
                                               const formValidation = this.editDataForm.validate()
                                               if (formValidation.isValid) {
                                                   const lines = value.split('\n')
                                                   lines[this._lineNr] = `"${editData.key}":"${Util.escapeForJson(this.editDataForm.state.fields.data).replace(/\\/g, '\\\\\\')}"${this._endsWithComma ? ',' : ''}`
                                                   const newJson = JSON.parse(lines.join('\n'))
                                                   newData = JSON.stringify(newJson,null,2)
                                                   if (onChange) {
                                                       if (this.state.isDataJson) {
                                                           // if input was Object output is an Object to
                                                           onChange(newJson)
                                                       } else {
                                                           onChange(newData)
                                                       }
                                                   }
                                                   /*this._editor.doc.replaceRange(`"${editData.key}":"${Util.escapeForJson(this.editDataForm.state.fields.data).replace(/\\/g, '\\\\\\')}"${this._endsWithComma ? ',' : ''}`, {
                                                       line: this._lineNr,
                                                       ch: 0
                                                   }, {line: this._lineNr})*/
                                                   //this.autoFormatSelection()
                                               }
                                           }
                                           this.setState({data: newData, editData: false})
                                       }}
                                       actions={[{
                                           key: 'cancel',
                                           label: 'Abbrechen',
                                           type: 'secondary'
                                       }, {
                                           key: 'ok',
                                           label: 'Speichern',
                                           type: 'primary'
                                       }]}
                                       title={'Edit'}>


                <GenericForm ref={(e) => {
                    this.editDataForm = e
                }} primaryButton={false}
                             values={{data: editData.value}}
                             onChange={(e) => {
                             }}
                             fields={{
                                 data: {
                                     fullWidth: true,
                                     label: editData.key,
                                     uitype: editData.uitype
                                 }
                             }}/>


            </SimpleDialog>
            }
            {showFab && <SimpleMenu key="menu" mini fab color="secondary" style={{
                zIndex: 999,
                position: 'absolute',
                bottom: '8px',
                right: '8px', ...fabButtonStyle
            }} items={allActions}/>}
            {showContextMenu && contextMenuItems &&

            <SimpleMenu
                anchorReference={"anchorPosition"}
                anchorPosition={showContextMenu}
                noButton={true}
                open={showContextMenu}
                onClose={() => {
                    this.setState({
                        showContextMenu: false
                    })
                }}
                mini items={contextMenuItems}/>}
            {filenames ?
                <div className={classes.files}>{filenames.map((entry, i) => {
                    return (
                        <a key={'file' + i}
                           onClick={() => {
                               this.setState({fileIndex: i})

                               if (onFileChange) {
                                   onFileChange(i)
                               }
                           }}
                           className={classNames(classes.file, i === finalFileIndex && classes.fileActive)}>{entry}</a>
                    )
                })}</div>
                : null}
            <UnControlledCodeMirror
                className={!height && classes.codemirror}
                autoCursor={true}
                key="editor"
                editorDidMount={editor => {
                    this._editor = editor
                    if (scrollPosition) {
                        editor.scrollTo(scrollPosition.left, scrollPosition.top)
                    }
                    if (height) {
                        editor.setSize(null, 800);
                    }
                }}
                value={value}
                options={options}
                onContextMenu={((editor, e) => {
                    if (type === 'json') {
                        e.preventDefault()

                        this.setState({showContextMenu: {left: e.clientX, top: e.clientY}})

                    }

                })}
                onScroll={(editor, e) => {
                    if (onScroll) {
                        onScroll(e)
                    }
                }}
                onKeyUp={(cm, e) => {
                    if (!cm.state.completionActive && /*Enables keyboard navigation in autocomplete list*/
                        !e.ctrlKey &&
                        e.keyCode > 64 && e.keyCode < 91) {
                        cm.execCommand("autocomplete")
                    }
                }}
                onBlur={(editor, e) => {
                    if (onBlur) {
                        onBlur(e, data)
                    }
                }}
                onChange={(editor, dataObject, changedData) => {
                    let newData
                    if (filenames) {
                        newData = ''
                        filenames.forEach((file, i) => {
                            newData += '//!#' + file + '\n'
                            if (i !== finalFileIndex) {
                                newData += files[i].trim() + '\n'
                            } else {
                                newData += changedData + '\n'
                                // filenames.push(getFirstLine(file))
                            }
                        })
                    } else {
                        newData = changedData
                    }
                    let newDataAsJson
                    if (this.state.isDataJson || type === 'json') {

                        try {
                            newDataAsJson = JSON.parse(newData)

                        } catch (e) {
                            console.error(e)
                            this.setState({stateError: `Fehler in der JSON Struktur: ${e.message}`, data: newData}, () => {

                                if (onError) {
                                    onError(e)
                                }
                            })
                            return
                        }
                    }

                    this.setState({stateError: false, data: newData}, () => {
                        if (onChange) {
                            if (this.state.isDataJson) {
                                // if input was Object output is an Object to
                                onChange(newDataAsJson)
                            } else {
                                onChange(newData)
                            }
                        }
                    })

                }}/>
            {(error || stateError) &&
            <div style={{color: 'red'}}>{error ? error + ' ' : ''}{stateError ? stateError : ''}</div>}</div>
    }
}


CodeEditor.propTypes = {
    lineNumbers: PropTypes.bool,
    readOnly: PropTypes.bool,
    height: PropTypes.number,
    onChange: PropTypes.func,
    error: PropTypes.any,
    onError: PropTypes.func,
    onScroll: PropTypes.func,
    onFileChange: PropTypes.func,
    fileIndex: PropTypes.number,
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


export default withStyles(styles, {withTheme: true})(CodeEditor)

