import React from 'react'
import PropTypes from 'prop-types'
import {TextField, Paper, MenuItem, withStyles, Chip} from 'ui/admin'
import {withApollo} from 'react-apollo'
import ApolloClient from 'apollo-client'
import gql from 'graphql-tag'

const styles = {
    container: {
        posistion: 'relative'
    },
    suggestions: {
        position: 'absolute',
        zIndex: 2
    }
}


class TypePicker extends React.Component {
    constructor(props) {
        super(props)

        this.state = {
            value: props.value,
            data: null,
            hasFocus: true,
            selIdx: 0
        }
    }

    componentWillReceiveProps(props) {
        console.log(props.value)
        this.setState({value: props.value})
    }

    render() {
        const {type, classes, placeholder} = this.props
        const {data, hasFocus, selIdx, value} = this.state
        return <div className={classes.container}>

            { !value && <TextField onChange={this.handleChange.bind(this)}
                                   onKeyDown={this.handleKeyDown.bind(this)}
                                   onFocus={() => this.setState({hasFocus: true})}
                                   onBlur={this.handleBlur.bind(this)} placeholder={placeholder}/> }

            { value && <Chip label={value.name} onDelete={this.handleRemovePick.bind(this)}/> }


            <Paper className={classes.suggestions} square>

                {hasFocus && data && data.results && data.results.map((item, idx) =>
                    <MenuItem
                        onClick={this.handlePick.bind(this, idx)}
                        selected={selIdx === idx}
                        key={idx}
                        component="div"
                        style={{
                            fontWeight: selIdx === idx ? 500 : 400,
                        }}
                    >{item.name} ({item._id})</MenuItem>
                )}


            </Paper>

        </div>
    }

    handleRemovePick() {
        this.setState({value: null})
    }

    handlePick(idx) {
        const item = this.state.data.results[idx],
            target = {value: item._id, name: item.name}
        this.props.onChange({target})
        this.setState({value: target, hasFocus: false})
    }

    handleChange(e) {
        const v = e.target.value.trim()
        if (v === '') {
            this.setState({data: null})
        } else {
            this.getData(e.target.value)
        }
    }

    handleBlur(e) {
        setTimeout(() => {
            this.setState({hasFocus: false})
        }, 500)
    }

    handleKeyDown(e) {
        const {data, selIdx} = this.state, keyCode = e.keyCode
        if (data && data.results) {
            const l = data.results.length
            if (keyCode === 40) {
                //KeyDown
                this.setState({selIdx: selIdx >= l - 1 ? 0 : selIdx + 1})
            } else if (keyCode === 38) {
                //KeyUp
                this.setState({selIdx: selIdx <= 0 ? l - 1 : selIdx - 1})
            } else if (keyCode === 13) {
                //Enter
                this.handlePick(selIdx)
            }
        }
    }

    getData(filter) {
        const {client, type} = this.props
        if (type) {

            const nameStartLower = type.charAt(0).toLowerCase() + type.slice(1) + 's'

            const variables = {filter},
                gqlQuery = gql`query ${nameStartLower}($sort: String,$limit: Int,$page: Int,$filter: String){
                ${nameStartLower}(sort:$sort, limit: $limit, page:$page, filter:$filter){limit offset total results{_id name}}}`

            try {
                const storeData = client.readQuery({
                    query: gqlQuery,
                    variables
                })
                if (storeData && storeData[nameStartLower]) {
                    // oh data are available in cache. show them first
                    this.setState({selIdx: 0, data: storeData[nameStartLower]})
                }
            } catch (e) {
            }

            client.query({
                fetchPolicy: 'network-only',
                forceFetch: true,
                query: gqlQuery,
                variables
            }).then(response => {
                this.setState({selIdx: 0, data: response.data[nameStartLower]})
            }).catch(error => {
                console.log(error.message)
                this.setState({selIdx: 0, data: null})
            })
        }
    }
}

TypePicker.propTypes = {
    value: PropTypes.object,
    placeholder: PropTypes.string,
    type: PropTypes.string.isRequired,
    onChange: PropTypes.func.isRequired,
    client: PropTypes.instanceOf(ApolloClient).isRequired,
    classes: PropTypes.object.isRequired
}

export default withStyles(styles)(withApollo(TypePicker))