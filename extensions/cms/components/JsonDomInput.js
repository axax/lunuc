import React from 'react'

/* Wrapper for input so we are able to pass a value prop  */
class JsonDomInput extends React.Component {
    state = {value: ''}

    constructor(props) {
        super(props)
        this.state = JsonDomInput.getStateFromProps(props)
    }

    static getStateFromProps(props) {
        return {
            valueOri: props.value,
            value: props.value || '',
            checkedOri: props.checked,
            checked: props.checked || false,
            time: props.time
        }
    }

    static getDerivedStateFromProps(nextProps, prevState) {
        if (nextProps.value !== prevState.valueOri ||
            nextProps.checked !== prevState.checkedOri ||
            nextProps.time !== prevState.time) {
            return JsonDomInput.getStateFromProps(nextProps)
        }
        // it is importent to return the prevState here
        // otherwise it won't refresh when property like style or placeholder change
        return prevState
    }

    shouldComponentUpdate(props, state) {
        return state.value !== this.state
    }

    valueChange = (e) => {
        const {onChange} = this.props
        const target = e.target, curValue = this.state.value
        let value = (target.type === 'checkbox' ? target.checked : target.value)

        if (curValue && curValue.constructor === Object) {
            value = {...curValue, displayValue: value}
        }

        this.setState({value, checked: target.checked})
        if (onChange) {
            onChange(e, value)
        }
    }

    render() {
        const {onChange, textarea, select, type, value, checked, defaultChecked, defaultValue, ...rest} = this.props
        const stateValue = this.state.value
        if (select) {
            return <select onChange={this.valueChange.bind(this)} {...rest} value={stateValue}/>
        } else if (textarea) {
            return <textarea onChange={this.valueChange.bind(this)} {...rest} value={stateValue}/>
        } else {
            const props = {type: (type || 'text')}
            if (type === 'checkbox') {
                // checkbox is checked when there is a value
                props.checked = !!stateValue
            } else if (type === 'radio') {
                // checkbox is checked when there is a value
                props.checked = this.state.checked
                props.value = value
            } else {
                if (stateValue.constructor === Object) {
                    props.value = stateValue.displayValue

                } else if (stateValue.constructor === Array) {

                } else {
                    props.value = stateValue
                }
            }
            return <input onChange={this.valueChange.bind(this)} {...rest} {...props} />
        }
    }

}

export default JsonDomInput

