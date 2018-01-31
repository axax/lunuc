import React from 'react'
import PropTypes from 'prop-types'
import {TextField, Paper, MenuItem, withStyles} from 'ui/admin'
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
            hasFocus: true
        }
    }

    componentWillReceiveProps(props) {
        this.setState({value: props.value})
    }

    render() {
        const {type, classes,...rest} = this.props
        const {data, hasFocus} = this.state
        return <div className={classes.container}>
            <TextField onChange={this.handleChange.bind(this)}
                       onFocus={()=>this.setState({hasFocus:true})}
                       onBlur={()=>this.setState({hasFocus:false})} {...rest}/>

            <Paper className={classes.suggestions} square>

                {hasFocus && data && data.results && data.results.map((item,idx) =>
                    <MenuItem
                        key={idx}
                        component="div"
                        style={{
                            fontWeight: true ? 500 : 400,
                        }}
                    >{item.name}</MenuItem>
                )}


            </Paper>

        </div>
    }

    handleChange(e) {
        console.log(e.target.value)
        this.getData(e.target.value)
    }

    getData(filter) {
        const {client, type} = this.props
        if (type) {
            let t = type
            if( type.indexOf('[')>=0){
                t = t.replace('[','').replace(']','')
            }

            const nameStartLower = t.charAt(0).toLowerCase() + t.slice(1) + 's'

            const variables = {filter},
                gqlQuery = gql`query ${nameStartLower}($sort: String,$limit: Int,$page: Int,$filter: String){
                ${nameStartLower}(sort:$sort, limit: $limit, page:$page, filter:$filter){limit offset total results{name}}}`

            try {
                const storeData = client.readQuery({
                    query: gqlQuery,
                    variables
                })
                if (storeData && storeData[nameStartLower]) {
                    // oh data are available in cache. show them first
                    this.setState({data: storeData[nameStartLower]})
                }
            } catch (e) {
            }

            client.query({
                fetchPolicy: 'network-only',
                forceFetch: true,
                query: gqlQuery,
                variables
            }).then(response => {
                this.setState({data: response.data[nameStartLower]})
            }).catch(error => {
                console.log(error.message)
                this.setState({data: null})
            })
        }
    }
}

TypePicker.propTypes = {
    value: PropTypes.string,
    type: PropTypes.string.isRequired,
    client: PropTypes.instanceOf(ApolloClient).isRequired,
    classes: PropTypes.object.isRequired
}

export default withStyles(styles)(withApollo(TypePicker))