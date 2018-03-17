import React from 'react'
import PropTypes from 'prop-types'
import ReactDOM from 'react-dom'
import {withStyles} from 'ui/admin'

const reservedJsKeywords = ['return', 'if', 'else', 'var', 'let', 'const','this','document']
const reservedJsCustomKeywords = ['on', 'Util','scope','history','refresh','getLocal','setLocal']

const styles = theme => ({
    editor: {
        display: 'block',
        tabSize: 2
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
    }
})

class ContentEditable extends React.Component {
    lastText = []

    constructor(props) {
        super(props)

    }

    render() {
        const {classes, style, children, setHtml, highlight} = this.props
        this.lastText['onChange'] = this.lastText['onBlur'] = children

        const props = {
            className: classes.editor,
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
        if (this.props.children !== ReactDOM.findDOMNode(this).innerText) {
            if (highlight) {
                ReactDOM.findDOMNode(this).innerHtml = this.highlight(this.props.children)
            } else {
                ReactDOM.findDOMNode(this).innerText = this.props.children
            }
        }
    }

    handleKeyDown(e) {
        // handle tab
        if (e.key === "Tab") {
            e.preventDefault();
            document.execCommand('insertHTML', false, '&#009')
        }
    }

    handleKeyUp(e) {

        if (e.getModifierState("Control") || e.key === "Shift") {
            // ignore if Control is pressed
            return
        }

        const {highlight} = this.props
        if (highlight) {


            const ignoreKeys = ["ArrowDown", "ArrowLeft", "ArrowUp", "ArrowRight", "End", "Home", "PageUp", "PageDown", "Meta"] // arrows
            if (ignoreKeys.indexOf(e.key) < 0) {

                const t = e.target
                var restore = this.saveCaretPosition(t, (e.key === "Enter" ? 1 : 0))

                t.innerHTML = this.highlight(t.innerText)

                restore()
            }
        }
    }

    highlight(str) {
        if (str) {
            const {highlight} = this.props
            if (highlight === 'json') {
                return this.highlightJson(str)
            } else if (highlight === 'js') {
                return this.highlightJs(str)
            }
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


    highlightJs(str) {
        const {classes} = this.props

        let inDQuote = false, inSQuote = false, keyword = '', res = ''

        for (let i = 0; i < str.length; i++) {
            const c = str[i]

            if (c === '\'' && !inDQuote) {
                inSQuote = !inSQuote
                if (inSQuote) {
                    keyword = ''
                    res += '<span class="' + classes.highlight3 + '">'
                }
                res += c
                if (!inSQuote) {
                    res += '</span>'
                }
            } else if (c === '"' && !inSQuote) {
                inDQuote = !inDQuote
                if (inDQuote) {
                    keyword = ''
                    res += '<span class="' + classes.highlight3 + '">'
                }
                res += c
                if (!inDQuote) {
                    res += '</span>'
                }
            } else if (!inDQuote && !inSQuote) {
                const code = str.charCodeAt(i)
                if (!(code > 64 && code < 91) && // upper alpha (A-Z)
                    !(code > 96 && code < 123)) { // lower alpha (a-z)
                    if (keyword) {
                        if (reservedJsKeywords.indexOf(keyword) >= 0 ) {
                            res = res.substring(0, res.length - keyword.length) + '<span class="' + classes.highlight1 + '">' + keyword + '</span>'
                        }else if ( reservedJsCustomKeywords.indexOf(keyword) >= 0) {
                            res = res.substring(0, res.length - keyword.length) + '<span class="' + classes.highlight4 + '">' + keyword + '</span>'
                        }
                        keyword = ''
                    }
                } else {
                    keyword += c
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