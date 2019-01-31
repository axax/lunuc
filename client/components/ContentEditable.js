import React from 'react'
import PropTypes from 'prop-types'
import ReactDOM from 'react-dom'
import {withStyles} from 'ui/admin'
import classNames from 'classnames'

const reservedJsKeywords = ['async', 'await', 'require', 'isNaN', 'JSON', 'parseFloat', 'return', 'if', 'else', 'var', 'while', 'let', 'for', 'const', 'this', 'document', 'console', 'import', 'from', 'class', 'true', 'false', 'export', 'function', 'undefined']
const reservedJsCustomKeywords = ['clientQuery', 'on', 'Util', 'scope', 'history', 'refresh', 'getLocal', 'setLocal', 'parent', 'getComponent', 'getKeyValueFromLS', 'setKeyValue']

const styles = theme => ({
    editor: {
        display: 'block',
        tabSize: 2,
        whiteSpace: 'pre',
        outline: 'none'
    },
    editorLines: {
        counterReset: 'line',
        paddingLeft: '50px !important',
        '& line': {
            counterIncrement: 'line',
            position: 'relative',
            '&:before': {
                position: 'absolute',
                background: '#f1f1f1',
                paddingRight: '3px',
                left: '-50px',
                display: 'block',
                width: '30px',
                color: '#c1c1c1',
                textAlign: 'right',
                content: 'counter(line)'
            }
        }
    },
    highlight1: {
        color: '#1e0a91',
        fontWeight: 'bold'
    },
    highlight2: {
        fontStyle: 'italic',
        fontWeight: 'bold'
    },
    highlight3: {
        color: '#268e00',
    },
    highlight4: {
        color: '#af0808',
        fontWeight: 'bold'
    },
    highlight5: {
        color: '#a1a1a1',
        fontStyle: 'italic'
    },
    italic: {
        fontStyle: 'italic'
    }
})

class ContentEditable extends React.Component {
    lastText = []
    historyPointer = 0


    constructor(props) {
        super(props)
        this.state = {
            dataOri: props.children,
            data: props.children,
            hasFocus: false,
            inputHasChanged: false
        }
    }

    static getDerivedStateFromProps(nextProps, prevState) {

        if (nextProps.children !== prevState.dataOri) {
            console.log('ContentEditable update state')

            return {
                dataOri: nextProps.children,
                data: nextProps.children
            }
        }
        return null
    }

    componentDidMount() {
        this.changeHistory = []
        this.changeHistory.push(this.props.children)
    }

    render() {
        const {classes, style, highlight, lines, className} = this.props
        const {data} = this.state
        const props = {
            className: classNames(classes.editor,lines && classes.editorLines, className),
            style,
            onKeyDown: this.handleKeyDown.bind(this),
            onKeyUp: this.handleKeyUp.bind(this),
            onInput: this.handleInput.bind(this),
            onBlur: this.handleBlur.bind(this),
            onFocus: this.handleFocus.bind(this),
            onPaste: this.handlePaste.bind(this),
            contentEditable: true,
            suppressContentEditableWarning: true
        }
        if (highlight) {
            return <span {...props} dangerouslySetInnerHTML={{__html: this.highlight(data)}}/>
        } else {
            return <span {...props}>{data}</span>
        }
    }

    shouldComponentUpdate(nextProps, nextState) {
        const {highlight} = nextProps

        if (nextState.hasFocus && nextState.inputHasChanged) {
            if (highlight) {
                //this.highlightDelay(ReactDOM.findDOMNode(this))
            }
        } else if (nextState.data !== this.state.data) {
            // only update if it doesn't have the focus and data changed
            return true
        }

        // never update we handle it manualy because of delayed highlighting
        return false
    }

    componentDidUpdate() {
        const {highlight} = this.props
        const {data} = this.state
        if (data !== ReactDOM.findDOMNode(this).innerText) {
            if (highlight) {
                ReactDOM.findDOMNode(this).innerHtml = this.highlight(data)
            } else {
                ReactDOM.findDOMNode(this).innerText = data
            }
        }
    }

    handlePaste(e) {
        // Stop data actually being pasted into div
        e.stopPropagation()
        e.preventDefault()

        // Get pasted data via clipboard API
        const clipboardData = e.clipboardData || window.clipboardData
        const pastedData = clipboardData.getData('Text')
        document.execCommand('insertText', false, pastedData)
    }

    handleKeyDown(e) {
        const {highlight} = this.props
        if (e.key === "Enter") {
            e.preventDefault()
            document.execCommand('insertHTML', false, '\n')
        } else
        // handle tab
        if (e.key === "Tab") {
            e.preventDefault()
            const selStr = window.getSelection().toString()

            if (e.shiftKey) {
                if (selStr) {
                    //TODO implement backspace for selections
                } else {
                    document.execCommand('delete', false, null)
                }
            } else {
                let tabChar
                if (highlight === 'json') {
                    tabChar = '  '
                } else {
                    tabChar = '&#009'
                }

                if (selStr) {
                    tabChar = selStr.replace(/^/gm, tabChar)
                }
                document.execCommand('insertHTML', false, tabChar)
            }
        } else if (e.metaKey || e.ctrlKey) {
            if (e.key === 'z' || e.key === 'Z') {
                // TODO: implement undo history
                e.preventDefault()

                const historyLength = this.changeHistory.length
                if (historyLength > 0 && this.historyPointer + 1 < historyLength) {
                    this.historyPointer++

                    const lastText = this.changeHistory[this.historyPointer]
                    const ele = ReactDOM.findDOMNode(this)
                    if (highlight) {
                        ele.innerHTML = this.highlight(lastText)
                    } else {
                        ele.innerText = lastText
                    }
                    this.placeCaretAtEnd(ele)
                }

            } else if ((e.key === 'y' || e.key === 'Y')) {
                // TODO: implement reundo history

            }
        }
    }

    placeCaretAtEnd(el) {
        el.focus()
        const range = document.createRange()
        range.selectNodeContents(el)
        range.collapse(false)
        const sel = window.getSelection()
        sel.removeAllRanges()
        sel.addRange(range)
    }

    handleKeyUp(e) {
        const {highlight} = this.props
        if (highlight) {
            const ignoreKeys = ['Shift', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowRight', 'End', 'Home', 'PageUp', 'PageDown', 'Control', 'Meta'] // arrows --> don't ignore Meta
            if (ignoreKeys.indexOf(e.key) < 0) {
                if (['Backspace', 'Enter'].indexOf(e.key)>=0) {
                    this.highlightImmediate(e.target)
                } else {
                    this.highlightDelayed(e.target)
                }
            }
        }
    }

    highlightDelayed(t) {
        clearTimeout(this.highlightTimeout)
        this.highlightTimeout = setTimeout(() => {
            this.highlightImmediate(t)
        }, 500)
    }


    highlightImmediate(t) {
        clearTimeout(this.highlightTimeout)
        const restore = this.saveCaretPosition(t, 0)
        if (this.historyPointer > 0) {
            this.changeHistory.splice(0, this.historyPointer)
        }
        this.changeHistory.unshift(t.innerText)
        this.historyPointer = 0
        if (this.changeHistory.length > 100) {
            this.changeHistory.splice(0, 100)
        }
        t.innerHTML = this.highlight(t.innerText)
        restore()
    }


    highlight(str) {
        if (str) {
            let res
            const startTime = new Date()
            const {highlight} = this.props
            if (highlight === 'json') {
                res = this.highlightJson(str)
            } else if (highlight === 'html') {
                res = this.highlightHtml(str)
            } else if (highlight === 'js') {
                res = this.highlightJs(str)
            } else {
                res = this.highlightText(str)
            }
            console.info(`highlight ${highlight} for in ${new Date() - startTime}ms`)
            return res
        }
        return str
    }

    highlightText(str) {
        let res = '<line>'
        for (let i = 0; i < str.length; i++) {
            const c = str[i]
            if (c === '\n') {
                //new line
                res += c + '</line><line>'
            }else{
                res += c
            }
        }
        res += '</line>'
        return res
    }


    highlightJson(str) {
        const {classes} = this.props

        let inDQuote = false, res = '<line>'

        for (let i = 0; i < str.length; i++) {
            const c = str[i]
            if (c === '\n') {
                //new line
                res += c + '</line><line>'
            } else if (c === '<') {
                // escape html tag in json
                res += '&lt;'
            } else if (c === '>') {
                // escape html tag in json
                res += '&gt;'
            } else if (c === '"') {
                inDQuote = !inDQuote
                if (inDQuote) {
                    res += '<span class="' + classes.highlight3 + '">'
                }
                res += c
                if (!inDQuote) {
                    res += '</span>'
                }
            } else if ((c === '}' || c === '{' || c === '[' || c === ']') && !inDQuote) {
                res += '<span class="' + classes.highlight1 + '">' + c + '</span>'
            } else if (c === '$') {
                res += '<span class="' + classes.highlight2 + '">' + c + '</span>'
            } else {
                res += c
            }
        }
        res += '</line>'
        return res
    }


    highlightHtml(str) {
        const {classes} = this.props

        let inDQuote = false, res = '<line>', inTag = false, inComment = false, inScript = false,
            inScriptLiteral = false

        for (let i = 0; i < str.length; i++) {
            const c = str[i]

            if (c === '\n') {
                //new line
                res += c + '</line><line>'
            } else if (inScript && c === '`') {
                inScriptLiteral = !inScriptLiteral
                if (inScriptLiteral) {
                    res += '<span class="' + classes.italic + '">' + c
                } else {
                    res += c + '</span>'
                }

            } else if (!inScript && !inComment && c === '$' && i + 2 < str.length && str[i + 1] == '{') {
                inScript = true
                res += '<span class="' + classes.highlight4 + '">$'
            } else if (inScript && !inScriptLiteral && c === '}') {
                inScript = false
                res += '}</span>'
            } else if (!inScript && !inComment && c === '"') {
                inDQuote = !inDQuote
                if (inDQuote) {
                    res += '<span class="' + classes.highlight3 + '">'
                }
                res += c
                if (!inDQuote) {
                    res += '</span>'
                }
            } else if (c === '<') {
                if (!inScript && !inComment && !inDQuote && !inTag && i + 3 < str.length && str[i + 1] == '!' && str[i + 2] == '-' && str[i + 3] == '-') {
                    inComment = true
                    res += '<span class="' + classes.highlight5 + '">&lt;'
                } else if (!inScript && !inComment && !inDQuote && !inTag) {
                    inTag = true
                    res += '<span class="' + classes.highlight1 + '">&lt;'
                } else {
                    res += '&lt;'
                }
            } else if (c === ' ' && inTag && !inDQuote) {
                res += c
                res += '</span>'
            } else if (c === '>') {
                if (inComment && i - 2 > 0 && str[i - 1] == '-' && str[i - 2] == '-') {
                    res += '&gt;</span>'
                    inComment = false
                } else if (inTag) {
                    inTag = false
                    res += '&gt;</span>'
                } else {
                    res += '&gt;'
                }
            } else {
                res += c
            }
        }
        res += '</line>'
        return res
    }

    highlightJs(str) {
        const {classes} = this.props

        let inDQuote = false, inSQuote = false, inLitQuote = false, inComment = false, inCommentMulti = false,
            keyword = '', res = '<line>'

        for (let i = 0; i < str.length; i++) {
            let c = str[i]
            if (c === '<') {
                c = '&lt;'
            } else if (c === '>') {
                c = '&gt;'
            }


            if (c === '\n') {
                //new line
                res += c + '</line><line>'
            } else if (inComment) {
                res += c
                if ((!inCommentMulti && c === '\n') || (inCommentMulti && c === '/' && str[i - 1] === '*')) {
                    res += '</span>'
                    inCommentMulti = inComment = false
                }
            } else if (c === '`' && !inDQuote && !inSQuote) {
                inLitQuote = !inLitQuote
                if (inLitQuote) {
                    keyword = ''
                    res += '<span class="' + classes.highlight3 + '">'
                }
                res += c
                if (!inLitQuote) {
                    res += '</span>'
                }
            } else if (c === '\'' && !inLitQuote && !inDQuote && !(inSQuote && str[i - 1] === '\\')) {
                inSQuote = !inSQuote
                if (inSQuote) {
                    keyword = ''
                    res += '<span class="' + classes.highlight3 + '">'
                }
                res += c
                if (!inSQuote) {
                    res += '</span>'
                }
            } else if (c === '"' && !inLitQuote && !inSQuote && !(inDQuote && str[i - 1] === '\\')) {
                inDQuote = !inDQuote
                if (inDQuote) {
                    keyword = ''
                    res += '<span class="' + classes.highlight3 + '">'
                }
                res += c
                if (!inDQuote) {
                    res += '</span>'
                }
            } else if (!inDQuote && !inSQuote && !inLitQuote) {
                if ((c === '/' || c === '*') && i > 0 && str[i - 1] === '/') {
                    res = res.substring(0, res.length - 1) + '<span class="' + classes.highlight5 + '">' + res.substring(res.length - 1)
                    //comment
                    if (c === '*') {
                        inCommentMulti = true
                    }
                    inComment = true
                } else {
                    const code = str.charCodeAt(i)
                    if (!(code > 64 && code < 91) && // upper alpha (A-Z)
                        !(code > 96 && code < 123)) { // lower alpha (a-z)
                        if (keyword) {
                            if (reservedJsKeywords.indexOf(keyword) >= 0) {
                                res = res.substring(0, res.length - keyword.length) + '<span class="' + classes.highlight1 + '">' + keyword + '</span>'
                            } else if (reservedJsCustomKeywords.indexOf(keyword) >= 0) {
                                res = res.substring(0, res.length - keyword.length) + '<span class="' + classes.highlight4 + '">' + keyword + '</span>'
                            }
                            keyword = ''
                        }
                    } else {
                        keyword += c
                    }
                }
                res += c
            } else {
                res += c
            }
        }

        res += '</line>'
        return res
    }


    saveCaretPosition(containerEl, offset) {
        var doc = containerEl.ownerDocument, win = doc.defaultView
        var range = win.getSelection().getRangeAt(0)
        var preSelectionRange = range.cloneRange()
        preSelectionRange.selectNodeContents(containerEl)
        preSelectionRange.setEnd(range.startContainer, range.startOffset)
        var start = preSelectionRange.toString().length

        const savedSel = {
            start: start,
            end: start + range.toString().length
        }

        return () => {

            var doc = containerEl.ownerDocument, win = doc.defaultView
            var charIndex = 0, range = doc.createRange()
            range.setStart(containerEl, 0)
            range.collapse(true)
            var nodeStack = [containerEl], node, foundStart = false, stop = false

            while (!stop && (node = nodeStack.pop())) {
                if (node.nodeType == 3) {
                    var nextCharIndex = charIndex + node.length
                    if (!foundStart && savedSel.start >= charIndex && savedSel.start <= nextCharIndex) {
                        range.setStart(node, savedSel.start - charIndex)
                        foundStart = true
                    }
                    if (foundStart && savedSel.end >= charIndex && savedSel.end <= nextCharIndex) {
                        range.setEnd(node, savedSel.end - charIndex)
                        stop = true
                    }
                    charIndex = nextCharIndex
                } else {
                    var i = node.childNodes.length
                    while (i--) {
                        nodeStack.push(node.childNodes[i])
                    }
                }
            }

            var sel = win.getSelection()
            sel.removeAllRanges()
            sel.addRange(range)

        }
    }


    handleInput(e) {
        const data = e.target.innerText
        if (data !== this.state.data) {
            this.setState({
                data,
                inputHasChanged: true
            }, () => {
                const {onChange} = this.props
                if (onChange) {
                    onChange(data)
                }
            })
        }
    }

    handleBlur(e) {
        this.setState({
            hasFocus: false
        })
        if (this.state.inputHasChanged) {
            const {onBlur} = this.props
            if (onBlur) {
                const data = e.target.innerText
                onBlur(data)
            }
        }
    }

    handleFocus(e) {
        this.setState({
            hasFocus: true,
            inputHasChanged: false
        })
    }
}

ContentEditable.propTypes = {
    style: PropTypes.object,
    lines: PropTypes.bool,
    onBlur: PropTypes.func,
    onChange: PropTypes.func,
    classes: PropTypes.object.isRequired,
    highlight: PropTypes.string
}

export default withStyles(styles)(ContentEditable)