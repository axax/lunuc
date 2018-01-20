import React from 'react'
import extensions from 'gen/extensions'
import BaseLayout from '../components/layout/BaseLayout'
import {ExpansionPanel,Typography, MenuItem, Select, TextField, Input} from 'ui/admin'


class TypesContainer extends React.Component {
    state = {
        age: '',
        name: 'hai'
    }

    handleChange = event => {
        this.setState({[event.target.name]: event.target.value})
    }

    render() {
        return <BaseLayout>
            <Typography type="display1" gutterBottom>Types</Typography>
            <Select
                value={this.state.age}
                onChange={this.handleChange}
                input={<Input name="age" id="age-simple"/>}
            >
                <MenuItem value="">
                    <em>None</em>
                </MenuItem>
                <MenuItem value={10}>Ten</MenuItem>
                <MenuItem value={20}>Twenty</MenuItem>
                <MenuItem value={30}>Thirty</MenuItem>
            </Select>


            {
                Object.keys(extensions).map(k => {
                    const value = extensions[k]

                    return <ExpansionPanel heading={<Typography type="headline">{value.name}</Typography>} key={k}>
                        <div><Typography type="body1" gutterBottom>{value.description}</Typography></div>
                        <Typography type="caption" gutterBottom>Types</Typography>
                    </ExpansionPanel>
                })
            }
        </BaseLayout>
    }
}


export default TypesContainer
