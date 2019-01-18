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
        if (nextProps.value !== prevState.valueOri) {
            return {value: nextProps.value, valueOri: nextProps.value}
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
        this.setState({value: e.target.value})
        if (onChange) {
            onChange(e)
        }
    }

    render() {
        const {value, onChange, textarea, ...rest} = this.props
        if (textarea) {
            return <textarea onChange={this.valueChange.bind(this)} value={this.state.value} {...rest} />
        } else {
            return <input onChange={this.valueChange.bind(this)} value={this.state.value} {...rest} />
        }
    }

}


JsonDomInput.propTypes = {
    value: PropTypes.string,
    onChange: PropTypes.func,
    textarea: PropTypes.bool
}

export default JsonDomInput

