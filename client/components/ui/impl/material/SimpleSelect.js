import React from 'react'
import PropTypes from 'prop-types'
import Input from 'material-ui/Input'
import Select from 'material-ui/Select'
import {MenuItem} from 'material-ui/Menu'


class SimpleSelect extends React.Component {
    render() {
        const {onChange, value, items} = this.props

        const name = 'name_' + Math.random()

        return <Select
            value={value}
            onChange={onChange}
            input={<Input name={name}/>}
        >
            {
                items.map(item => {
                    return <MenuItem key={item.value} value={item.value}>{item.name}{item.hint &&
                    <em>&nbsp;({item.hint})</em>}</MenuItem>
                })
            }
        </Select>
    }
}


SimpleSelect.propTypes = {
    items: PropTypes.array.isRequired
}

export default SimpleSelect