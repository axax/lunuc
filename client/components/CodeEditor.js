import React from 'react'
import PropTypes from 'prop-types'
import {SimpleMenu, SimpleDialog, ViewListIcon, LaunchIcon, EditIcon, CodeIcon, AddIcon} from 'ui/admin'
import RenderInNewWindow from './layout/RenderInNewWindow'
import CodeMirrorWrapper from './codemirror/CodeMirrorWrapper'
import CodeMirror from 'codemirror'
import './codemirror/javascript'
import './codemirror/formatting'
import './codemirror/keywords'
import './codemirror/search'
import 'codemirror/addon/display/rulers'
import 'codemirror/mode/htmlmixed/htmlmixed'
import 'codemirror/mode/clike/clike'
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
import Util from '../util/index.mjs'
import styled from '@emotion/styled'

const StyledRoot = styled('div')(({ error, inWindow}) => ({
    display: 'flex',
    flexDirection: 'column',
    ...(error && {
        border: 'solid 1px red'
    }),
    ...(inWindow && {
        height:'100%'
    })
}))

const StyledFile = styled('a')(({ active }) => ({
    display: 'inline-block',
    padding: '0.5rem',
    background: '#efefef',
    borderRadius: '0.1rem',
    cursor: 'pointer',
    '&:hover': {
        background: '#aaa'
    },
    ...(active && {
        background: '#aaa'
    })
}))


const snippets = {
    'customJs': [
        {
            text: "on('beforerender',()=>{\n\t\n})",
            displayText: 'beforerender event'
        },
        {
            text: "on(['resourcesready'],()=>{})",
            displayText: 'resourcesready event'
        },
        {
            text: `on('mount',()=>{\n\tDomUtil.waitForElement('.selector').then((el)=>{})\n})`,
            displayText: 'mount event'
        },
        {
            text: `
on('customevent',p=>{
\tif(p.action === 'modalClosed'){
\t\t
\t}else if(p.action === 'modalButtonClicked'){
\t}
})`,
            displayText: 'custom event'
        },
        {
            text: `DomUtil.waitForElement('.selector').then(()=>{\n\t\n})`,
            displayText: 'waitForElement'
        },
        {
            text: `on('click',(p,e)=>{\n\tif(p.action==='click'){\n\t\tconsole.log(e)\n\t}\n})`,
            displayText: 'on click event'
        },
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
        const isDataJson = props.forceJson || props.children && (props.children.constructor === Object || props.children.constructor === Array)

        let data = props.children

        if (isDataJson) {
            if (data) {
                data = JSON.stringify(data, null, 2)
            }
        }

        return {
            data,
            isDataJson,
            stateError: false,
            error: props.error,
            lineNumbers: props.lineNumbers,
            type: props.type,
            identifier: props.identifier,
            fileIndex: props.fileIndex || 0,
            showFileSplit: true,
            renderInWindow:false,
            stateDate: new Date()
        }
    }

    static getDerivedStateFromProps(nextProps, prevState) {
        if (!!nextProps.error !== !!prevState.error ||
            nextProps.identifier !== prevState.identifier ||
            (!prevState._stateUpdate &&
                !prevState.stateError && (nextProps.controlled) &&
                (nextProps.children !== prevState.data || nextProps.lineNumbers !== prevState.lineNumbers || nextProps.type !== prevState.type)
            )) {
            console.log('CodeEditor update state ' + nextProps.identifier)
            return CodeEditor.getStateFromProps(nextProps, prevState)
        }
        return {...prevState, _stateUpdate: false}
    }

    setState(state, callback) {
        state._stateUpdate = true
        super.setState(state, callback)

    }

    shouldComponentUpdate(nextProps, nextState) {
        return nextState.stateError !== this.state.stateError ||
            nextState.stateDate !== this.state.stateDate ||
            nextState.renderInWindow !== this.state.renderInWindow ||
            nextState.identifier !== this.state.identifier ||
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

    changeLine({lineNr, line, value}) {
        const {onChange} = this.props
        let newDataAsString = value, newDataAsJson
        const lines = value.split('\n')
        lines[lineNr] = line

        try {
            newDataAsJson = JSON.parse(lines.join('\n'))
            newDataAsString = JSON.stringify(newDataAsJson, null, 2)
        } catch (e) {
            console.log(e, lines.join('\n'))
            return false
        }

        if (onChange) {
            if (this.state.isDataJson) {
                // if input was Object output is an Object to
                onChange(newDataAsJson)
            } else {
                onChange(newDataAsString)
            }
        }
        this.setState({data: newDataAsString})

        return true

    }


    render() {
        const {height, onFileChange, onChange, onBlur, onScroll, error, onError, readOnly, lineNumbers, type, actions, showFab, style, fabButtonStyle, className, fileSplit} = this.props
        const {stateError, showFileSplit, fileIndex, showContextMenu, editData, data, renderInWindow} = this.state
        const options = {
                mode: {},
                /* theme: 'material-ocean',*/
                historyEventDelay: 1250,
                readOnly,
                lineNumbers,
                tabSize: 2,
                foldGutter: true,
                lint: false,
                gutters: ['CodeMirror-lint-markers', 'CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
                indentWithTabs: false,
                smartIndent: true,
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
            },
            hasError = (error || stateError)

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


            options.keyword = {
                "\"$inlineEditor\"": "custom",
                "\"slug\"": "custom-link"
            }

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

                    this.setState({renderInWindow:true})
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
            const loc = this._editor.coordsChar(showContextMenu, 'window')
            this._curLineNr = loc.line
            this._curLine = this._editor.doc.getLine(loc.line).trim()
            this._curLineEndsWithComma = this._curLine.endsWith(',')

            let tempJson
            try {
                tempJson = JSON.parse('{' + (this._curLineEndsWithComma ? this._curLine.substring(0, this._curLine.length - 1) : this._curLine) + '}')
            } catch (e) {
            }
            if (tempJson) {
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
                const keys = Object.keys(tempJson)
                if(keys.length>0 && keys[0]=='slug'){
                    contextMenuItems.push({
                        icon: <CodeIcon/>,
                        name: 'Open Page',
                        onClick: () => {
                            location.href = '/'+tempJson.slug
                        }
                    })
                }

                if (this.props.propertyTemplates) {
                    contextMenuItems.push({
                        icon: <AddIcon/>,
                        name: 'Add',
                        items: this.props.propertyTemplates.map(f => ({
                            name: f.title,
                            onClick: () => {
                                this.changeLine({
                                    value,
                                    lineNr: this._curLineNr,
                                    line: `${this._curLine}${!this._curLine || this._curLineEndsWithComma ? '' : ','}${f.template}${this._curLineEndsWithComma ? ',' : ''}`
                                })
                            }
                        }))
                    })
                }
            } else if (this.props.templates) {
                let commaAtEnd = this._curLineEndsWithComma, commaAtStart = !this._curLineEndsWithComma
                if (!commaAtEnd) {
                    const nextLine = this._editor.doc.getLine(this._curLineNr + 1).trim()
                    if (nextLine.startsWith('{')) {
                        commaAtEnd = true
                    }
                    if (this._curLine.endsWith('[')) {
                        commaAtStart = false
                    }
                }
                contextMenuItems = [
                    {
                        icon: <AddIcon/>,
                        name: 'Add',
                        items: this.props.templates.map(f => ({
                            name: f.title,
                            onClick: () => {
                                if (!this.changeLine({
                                    value,
                                    lineNr: this._curLineNr,
                                    line: `${this._curLine}${commaAtStart ? ',' : ''}${f.template}${commaAtEnd ? ',' : ''}`
                                })) {

                                    this.changeLine({
                                        value,
                                        lineNr: this._curLineNr,
                                        line: `${this._curLine}${commaAtStart ? ',' : ''}"c":${f.template}${commaAtEnd ? ',' : ''}`
                                    })
                                }
                            }
                        }))
                    }
                ]
            }
        }
        const comp = <StyledRoot
                        error={error || stateError}
                        inWindow={renderInWindow}
                        className={className}
                        style={style}>


            {editData && <SimpleDialog fullWidth={true} maxWidth="md" key="newSiteDialog" open={true}
                                       onClose={(e) => {
                                           if (e.key === 'ok') {
                                               const formValidation = this.editDataForm.validate()
                                               if (formValidation.isValid) {
                                                   this.changeLine({
                                                       value,
                                                       lineNr: this._curLineNr,
                                                       line: `"${editData.key}":"${Util.escapeForJson(this.editDataForm.state.fields.data).replace(/\\/g, '\\\\\\')}"${this._curLineEndsWithComma ? ',' : ''}`
                                                   })
                                               }
                                           }
                                           this.setState({editData: false})
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


                <GenericForm onRef={(e) => {
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
                <div>{filenames.map((entry, i) => {
                    return (
                        <StyledFile key={'file' + i}
                           onClick={() => {
                               //this._editor.clearHistory()
                               this.setState({fileIndex: i})

                               if (onFileChange) {
                                   onFileChange(i)
                               }
                           }}
                           active={i === finalFileIndex}>{entry}</StyledFile>
                    )
                })}</div>
                : null}
            <CodeMirrorWrapper
                className={(!height ? 'react-codemirror2-height':'')+(renderInWindow ? ' react-codemirror2-in-window':'')}
                autoCursor={false}
                key="editor"
                editorDidMount={editor => {
                    this._editor = editor
                    this.setEditorPosition()
                }}
                hasError={hasError}
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
                        onBlur(e, this.state.data)
                    }
                }}
                onChange={(editor, dataObject, changedData) => {
                    let newDataAsString
                    if (filenames) {
                        newDataAsString = ''
                        filenames.forEach((file, i) => {
                            newDataAsString += '//!#' + file + '\n'
                            if (i !== finalFileIndex) {
                                newDataAsString += files[i].trim() + '\n'
                            } else {
                                newDataAsString += changedData + '\n'
                                // filenames.push(getFirstLine(file))
                            }
                        })
                    } else {
                        newDataAsString = changedData
                    }
                    let newDataAsJson
                    if (newDataAsString && (this.state.isDataJson || type === 'json')) {

                        try {
                            newDataAsJson = JSON.parse(newDataAsString)
                        } catch (e) {
                            const newStateError = `Fehler in der JSON Struktur: ${e.message}`
                            if (stateError !== newStateError) {
                                console.log(e)
                                this.setState({
                                    data: newDataAsString,
                                    stateError: newStateError
                                }, () => {

                                    if (onError) {
                                        onError(e, newDataAsString)
                                    }
                                })
                            }
                            return false
                        }
                    }

                    this.setState({stateError: false, data: newDataAsString}, () => {
                        if (onChange) {
                            if (this.state.isDataJson) {
                                // if input was Object output is an Object to
                                onChange(newDataAsJson)
                            } else {
                                onChange(newDataAsString)
                            }

                            if (this._editor.hasFocus()) {

                                // restore focus
                                setTimeout(() => {
                                    this._editor.focus()
                                }, 500)
                            }
                        }
                    })

                }}/>
            {hasError &&
            <div style={{color: 'red'}}>{error ? error + ' ' : ''}{stateError ? stateError : ''}</div>}</StyledRoot>

        if(renderInWindow){
            return <RenderInNewWindow title="Code Editor" onClose={()=>{
                this.setState({renderInWindow:false})
            }}>{comp}</RenderInNewWindow>

        }
        return comp
    }

    setEditorPosition(){
        if(this._editor) {
            const {scrollPosition, height} = this.props
            if (scrollPosition) {
                this._editor.scrollTo(scrollPosition.left, scrollPosition.top)
            }
            if (height) {
                this._editor.setSize(null, height)
            }
        }
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
    propertyTemplates: PropTypes.object,
    templates: PropTypes.object,
    fabButtonStyle: PropTypes.object,
    className: PropTypes.string,
    scrollPosition: PropTypes.object
}


export default CodeEditor

