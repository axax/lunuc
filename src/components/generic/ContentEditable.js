import React from 'react'
import PropTypes from 'prop-types'
import ReactDOM from 'react-dom'


class ContentEditable extends React.Component {
    constructor(props) {
        super(props)
    }

    render(){
        return <div
            style={{backgroundColor:'#fff',minHeight:200,overflow:'auto', whiteSpace: 'pre', fontFamily: 'monospace'}}
            onInput={this.emitChange.bind(this,'onChange')}
            onBlur={this.emitChange.bind(this,'onBlur')}
            contentEditable
            dangerouslySetInnerHTML={{__html: this.props.children}}></div>
    }

    shouldComponentUpdate(nextProps){
        return nextProps.children !== ReactDOM.findDOMNode(this).innerHTML
    }

    componentDidUpdate() {
        if ( this.props.children !== ReactDOM.findDOMNode(this).innerHTML ) {
            ReactDOM.findDOMNode(this).innerHTML = this.props.children;
        }
    }

    emitChange(prop){
        var html = ReactDOM.findDOMNode(this).innerHTML
        if (this.props[prop] && html !== this.lastHtml) {

            this.props[prop](html)
        }
        this.lastHtml = html
    }
}

ContentEditable.propTypes = {
    onBlur: PropTypes.func,
    onChange: PropTypes.func
}

export default ContentEditable