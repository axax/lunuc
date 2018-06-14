import React from 'react'
import PropTypes from 'prop-types'
import {TextField, Paper, MenuItem, withStyles, Chip, Avatar} from 'ui/admin'
import {withApollo} from 'react-apollo'
import ApolloClient from 'apollo-client'
import gql from 'graphql-tag'
import {getImageTag, getImageSrc} from 'client/util/media'

const styles = {
    root: {
        height: 50
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
            value: props.value || [],
            data: null,
            hasFocus: true,
            selIdx: 0,
            textValue: ''
        }
    }

    componentWillReceiveProps(props) {
        this.setState({value: props.value || [], hasFocus: false})
    }

    render() {
        console.log('render TypePicker')
        const {classes, placeholder, multi} = this.props
        const {data, hasFocus, selIdx, value, textValue} = this.state

        const field = this.props.field || 'name'

        return <div className={classes.root}>

            { (!value.length || multi) && <TextField value={textValue} onChange={this.handleChange.bind(this)}
                                                     onKeyDown={this.handleKeyDown.bind(this)}
                                                     onFocus={() => this.setState({hasFocus: true})}
                                                     onBlur={this.handleBlur.bind(this)} placeholder={placeholder}/> }

            { value.map((v, i) =>
                <Chip key={i} label={v[field]} onDelete={this.handleRemovePick.bind(this, i)}
                      avatar={v.__typename === 'Media' ? <Avatar src={getImageSrc(v._id, {height: 30})}/> : null}/>)
            }

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
                    >{item.__typename === 'Media' ? getImageTag(item._id, {height: 30}) : ''} {item[field]}
                    </MenuItem>
                )}


            </Paper>

        </div>
    }

    handleRemovePick(idx) {
        const value = this.state.value.slice(0)
        value.splice(idx, 1)
        this.props.onChange({target: {value, name: this.props.name}})
    }

    handlePick(idx) {
        const field = this.props.field || 'name'
        const value = (this.state.value ? this.state.value.slice(0) : []), item = this.state.data.results[idx]
        value.push({_id: item._id, [field]: item[field], __typename: this.props.type})
        this.props.onChange({target: {value, name: this.props.name}})
        this.setState({textValue: '', hastFocus: false, data: null})

    }

    handleChange(e) {
        const v = e.target.value.trim()
        if (v === '') {
            this.setState({data: null, textValue: v})
        } else {
            this.setState({textValue: v})
            this.getData(e.target.value)
        }
    }

    handleBlur(e) {
        setTimeout(() => {
            if (this.state.hasFocus)
                this.setState({hasFocus: false})
        }, 500)
    }

    handleKeyDown(e) {
        const {data, selIdx} = this.state
        if (data && data.results) {
            const l = data.results.length
            if (e.key === "ArrowDown") {
                this.setState({selIdx: selIdx >= l - 1 ? 0 : selIdx + 1})
            } else if (e.key === "ArrowUp") {
                this.setState({selIdx: selIdx <= 0 ? l - 1 : selIdx - 1})
            } else if (e.key === "Enter") {
                this.handlePick(selIdx)
            }
        }
    }

    getData(filter) {
        const {client, type, field} = this.props
        if (type) {

            const nameStartLower = type.charAt(0).toLowerCase() + type.slice(1) + 's'

            const variables = {filter},
                gqlQuery = gql`query ${nameStartLower}($sort: String,$limit: Int,$page: Int,$filter: String){
                ${nameStartLower}(sort:$sort, limit: $limit, page:$page, filter:$filter){limit offset total results{_id ${field || 'name'}}}}`

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
                this.setState({hasFocus: true, selIdx: 0, data: response.data[nameStartLower]})
            }).catch(error => {
                console.log(error.message)
                this.setState({selIdx: 0, data: null})
            })
        }
    }
}

TypePicker.propTypes = {
    value: PropTypes.array,
    placeholder: PropTypes.string,
    multi: PropTypes.bool,
    name: PropTypes.string.isRequired,
    field: PropTypes.string,
    type: PropTypes.string.isRequired,
    onChange: PropTypes.func.isRequired,
    client: PropTypes.instanceOf(ApolloClient).isRequired,
    classes: PropTypes.object.isRequired
}

export default withStyles(styles)(withApollo(TypePicker))