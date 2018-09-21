import React from 'react'
import PropTypes from 'prop-types'
import ReactDOM from 'react-dom'
import {withStyles} from 'ui/admin'
import classNames from 'classnames'

const reservedJsKeywords = ['isNaN', 'JSON', 'parseFloat', 'return', 'if', 'else', 'var', 'while', 'let', 'for', 'const', 'this', 'document', 'console', 'import', 'from', 'class', 'true', 'false', 'export', 'function', 'undefined']
const reservedJsCustomKeywords = ['clientQuery', 'on', 'Util', 'scope', 'history', 'refresh', 'getLocal', 'setLocal', 'parent', 'getComponent', 'getKeyValueFromLS', 'setKeyValue']

const styles = theme => ({
    editor: {
        display: 'block',
        tabSize: 2,
        whiteSpace: 'pre'
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
        this.lastText['onChange'] = this.lastText['onBlur'] = props.children

    }

    componentDidMount() {
        this.changeHistory = []
        this.changeHistory.push(this.props.children)
    }

    render() {
        const {classes, style, children, setHtml, highlight, className} = this.props
        const props = {
            className: classNames(classes.editor, className),
            style,
            onKeyDown: this.handleKeyDown.bind(this),
            onKeyUp: this.handleKeyUp.bind(this),
            onInput: this.emitChange.bind(this, 'onChange'),
            onBlur: this.emitChange.bind(this, 'onBlur'),
            contentEditable: true,
            suppressContentEditableWarning: true
        }
        if (setHtml || highlight) {
            return <span {...props} dangerouslySetInnerHTML={{__html: this.highlight(children)}}/>
        } else {
            return <span {...props}>{children}</span>
        }
    }

    shouldComponentUpdate(nextProps) {
        return nextProps.children !== ReactDOM.findDOMNode(this).innerText
    }

    componentDidUpdate() {
        const {children, highlight} = this.props
        if (children !== ReactDOM.findDOMNode(this).innerText) {
            if (highlight) {
                ReactDOM.findDOMNode(this).innerHtml = this.highlight(children)
            } else {
                ReactDOM.findDOMNode(this).innerText = children
            }
        }
    }


    handleKeyDown(e) {
        const {highlight} = this.props
        if( e.key === "Enter"){
            e.preventDefault()
            document.execCommand('insertHTML', false, '\n')
        }else
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
        if (e.getModifierState("Control") || e.key === "Shift") {
            // ignore if Control is pressed
            return
        }

        const {highlight} = this.props
        if (highlight) {


            const ignoreKeys = [ "ArrowDown", "ArrowLeft", "ArrowUp", "ArrowRight", "End", "Home", "PageUp", "PageDown", "Meta", "Control"] // arrows
            if (ignoreKeys.indexOf(e.key) < 0) {
                const t = e.target
                var restore = this.saveCaretPosition(t,0)
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
        }
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
            }
            console.info(`highlight ${highlight} for in ${new Date() - startTime}ms`)
            return res
        }
        return str
    }

    highlightJson(str) {
        const {classes} = this.props

        let inDQuote = false, res = ''

        for (let i = 0; i < str.length; i++) {
            const c = str[i]
            if (c === '<') {
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
        return res
    }


    highlightHtml(str) {
        const {classes} = this.props

        let inDQuote = false, res = '', inTag = false, inComment = false, inScript = false, inScriptLiteral = false

        for (let i = 0; i < str.length; i++) {
            const c = str[i]
            if (inScript && c === '`') {
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
        return res
    }

    highlightJs(str) {
        const {classes} = this.props

        let inDQuote = false, inSQuote = false, inLitQuote = false, inComment = false, inCommentMulti = false,
            keyword = '', res = ''

        for (let i = 0; i < str.length; i++) {
            let c = str[i]
            if (c === '<') {
                c = '&lt;'
            } else if (c === '>') {
                c = '&gt;'
            }

            if (inComment) {
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
                if ( (c === '/' || c === '*') && i > 0 && str[i - 1] === '/') {
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
        return res
    }


    saveCaretPosition(ctx, offset) {
        const sel = window.getSelection(), range = sel.getRangeAt(0)
        range.setStart(ctx, 0)
        const len = range.toString().length + offset
        console.log(len,this.keyRangeEndOffset )
        return () => {
            const pos = this.getTextNodeAtPosition(ctx, len), range = new Range()
            sel.removeAllRanges()
            range.setStart(pos.node, pos.position)
            sel.addRange(range)
        }
    }


    getTextNodeAtPosition(root, index) {
        let lastNode = null
        const treeWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, function next(elem) {
            if (index > elem.textContent.length) {
                index -= elem.textContent.length
                lastNode = elem
                return NodeFilter.FILTER_REJECT
            }
            return NodeFilter.FILTER_ACCEPT
        })
        var c = treeWalker.nextNode()
        return {
            node: c ? c : root,
            position: c ? index : 0
        }
    }

    emitChange(prop) {
        var text = ReactDOM.findDOMNode(this).innerText
        if (this.props[prop] && text !== this.lastText[prop]) {
            this.props[prop](text)
        }
        this.lastText[prop] = text
    }
}

ContentEditable.propTypes = {
    style: PropTypes.object,
    onBlur: PropTypes.func,
    onChange: PropTypes.func,
    setHtml: PropTypes.bool,
    classes: PropTypes.object.isRequired,
    highlight: PropTypes.string
}

export default withStyles(styles)(ContentEditable)