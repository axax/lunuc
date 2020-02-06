import React from 'react'
import PropTypes from 'prop-types'


class ContentEditable extends React.Component {

    constructor(props) {
        super(props)

        this.state = ContentEditable.getStateFromProps(props)
    }

    static getStateFromProps(props) {
        return {
            data: props.children,
            dataOri: props.children
        }
    }

    static getDerivedStateFromProps(nextProps, prevState) {
        if (nextProps.children !== prevState.dataOri) {
            return ContentEditable.getStateFromProps(nextProps)
        }
        return null
    }

    shouldComponentUpdate(props, state) {
        return state.dataOri !== this.state.dataOri && this.state.data !== state.data
    }

    render() {
        const {tag, children, onChange, ...props} = this.props
        const _this = this
        return React.createElement(tag, {
            contentEditable: true,
            onInput: (e) => {
                let data = e.target.innerText
                if(props.dangerouslySetInnerHTML){
                    data = data.replace(/(\r\n|\n|\r)/g,'<br />')
                }
                _this.setState({data}, () => {
                    onChange(data)
                })
            },
            suppressContentEditableWarning: true, ...props
        }, children)
    }

}


ContentEditable.propTypes = {
    tag: PropTypes.string,
    children: PropTypes.any,
    onChange: PropTypes.func,
}

export default ContentEditable
