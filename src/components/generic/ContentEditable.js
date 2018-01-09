import React from 'react'
import PropTypes from 'prop-types'
import ReactDOM from 'react-dom'


class ContentEditable extends React.Component {
    lastText = []

    constructor(props) {
        super(props)

    }

    render(){
        const {style, children} = this.props
        this.lastText['onChange'] = this.lastText['onBlur'] =this.props.children

        return <div
            style={style}
            onInput={this.emitChange.bind(this,'onChange')}
            onBlur={this.emitChange.bind(this,'onBlur')}
            contentEditable dangerouslySetInnerHTML={{__html: this.props.children}} />
    }

    shouldComponentUpdate(nextProps){
        return nextProps.children !== ReactDOM.findDOMNode(this).innerText
    }

    componentDidUpdate() {
        if ( this.props.children !== ReactDOM.findDOMNode(this).innerText ) {
            ReactDOM.findDOMNode(this).innerText = this.props.children;
        }
    }

    emitChange(prop){
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
    onChange: PropTypes.func
}

export default ContentEditable