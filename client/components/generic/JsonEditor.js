import React from 'react'
import PropTypes from 'prop-types'
import ReactDOM from 'react-dom'
import {withStyles} from 'ui/admin'

const reservedJsKeywords = ['return', 'if', 'else', 'var', 'while', 'let', 'for', 'const', 'this', 'document', 'console', 'import', 'from', 'class', 'true', 'false', 'export', 'function', 'undefined']
const reservedJsCustomKeywords = ['clientQuery', 'on', 'Util', 'scope', 'history', 'refresh', 'getLocal', 'setLocal', 'parent', 'getComponent', 'getKeyValueFromLS', 'setKeyValue']

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
    },
    highlight5: {
        color: '#a1a1a1',
        fontStyle: 'italic'
    }
})

class JsonEditor extends React.Component {

    json = null

    constructor(props) {
        super(props)

        this.json = JSON.parse(props.children)
    }

    renderJsonRec(json, key) {
        if (!json) return null
        if (!key) key = 'root'

        if (json.constructor === Array) {
            const acc = []
            json.forEach((item, idx) => {
                key += '.' + idx
                acc.push(this.renderJsonRec(item, key))
            })
            return acc
        } else if (json.constructor === Object) {
            const t = (json.t || 'div')
            key += '.' + t
            return <div key={key}>
                {t}
                {this.renderJsonRec(json.c, key)}
                </div>
        } else {
            return json
        }
    }

    render() {
        const {classes} = this.props
        console.log(this.renderJsonRec(this.json))
        return <div class={classes.editor}>{this.renderJsonRec(this.json)}</div>

    }

    shouldComponentUpdate(nextProps) {
    }

    componentDidUpdate() {
    }


    emitChange(prop) {
        var text = ReactDOM.findDOMNode(this).innerText
        if (this.props[prop] && text !== this.lastText[prop]) {
            this.props[prop](text)
        }
        this.lastText[prop] = text
    }
}

JsonEditor.propTypes = {
    style: PropTypes.object,
    onChange: PropTypes.func,
    classes: PropTypes.object.isRequired,
}

export default withStyles(styles)(JsonEditor)