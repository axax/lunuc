import React from 'react'
import PropTypes from 'prop-types'

/* Wrapper for input so we are able to pass a value prop  */
class JsonDomInput extends React.Component {
    state = {value: ''}

    constructor(props) {
        super(props)
        this.state = {
            valueOri: props.value,
            value: props.value || ''
        }
    }

    static getDerivedStateFromProps(nextProps, prevState) {
        if (nextProps.value !== prevState.valueOri || nextProps.time !== prevState.time) {
            return {value: nextProps.value, valueOri: nextProps.value, time: nextProps.time}
        }
        // it is importent to return the prevState here
        // otherwise it won't refresh when property like style or placeholder change
        return prevState
    }

    shouldComponentUpdate(props, state) {
        return state !== this.state
    }

    valueChange = (e) => {
        const {onChange} = this.props
        const target = e.target, value = (target.type === 'checkbox' ? target.checked : target.value)
        this.setState({value})
        if (onChange) {
            onChange(e, value)
        }
    }

    render() {
        const {value, onChange, textarea, type, ...rest} = this.props
        if (textarea) {
            return <textarea onChange={this.valueChange.bind(this)} value={this.state.value} {...rest} />
        } else {
            const props = {type:(type || 'text')}
            if (type === 'checkbox') {
                props.checked = !!this.state.value
            }else{
                props.value = this.state.value
            }
            return <input onChange={this.valueChange.bind(this)} {...rest} {...props} />
        }
    }

}


JsonDomInput.propTypes = {
    type: PropTypes.string,
    value: PropTypes.any,
    onChange: PropTypes.func,
    textarea: PropTypes.bool
}

export default JsonDomInput

