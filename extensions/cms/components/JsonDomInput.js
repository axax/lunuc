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
        const {onChange, textarea, select, type, value, ...rest} = this.props
        const stateValue = this.state.value
        if( select ){
            return <select onChange={this.valueChange.bind(this)} {...rest} value={stateValue} />
        }else if (textarea) {
            return <textarea onChange={this.valueChange.bind(this)} {...rest} value={stateValue} />
        } else {
            const props = {type:(type || 'text')}
            if (type === 'checkbox') {
                props.checked = !!stateValue
            }else{
                if( stateValue.constructor === Object){
                    console.log(stateValue)
                }else  if( stateValue.constructor === Array){
                    console.log(stateValue)

                }else {
                    props.value = stateValue
                }
            }
            return <input onChange={this.valueChange.bind(this)} {...rest} {...props} />
        }
    }

}


JsonDomInput.propTypes = {
    type: PropTypes.string,
    value: PropTypes.any,
    onChange: PropTypes.func,
    textarea: PropTypes.bool,
    select: PropTypes.bool,
}

export default JsonDomInput

