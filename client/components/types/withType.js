import React from 'react'
import {connect} from 'react-redux'
import {withApollo} from 'react-apollo'
import gql from 'graphql-tag'
import {getTypeQueries} from 'util/types'


// enhance cmsview with editor functionalities if in edit mode
export default function(WrappedComponent) {


    class Wrapper extends React.Component {
        constructor(props) {
            super(props)
        }

        render() {
            return <WrappedComponent createData={this.createData.bind(this)}
                                     updateData={this.updateData.bind(this)}
                                     {...this.props}/>
        }



        createData(input, optimisticInput, options) {
            const {client, type} = this.props
            if (type) {
                const queries = getTypeQueries(type)
                return client.mutate({
                    mutation: gql(queries.create),
                    variables: {
                        _version: options && options._version,
                        ...input
                    },
                    update: (store, {data}) => {
                        window.location.href = window.location.href
                    }
                })
            }
        }


        updateData(input, optimisticInput, options) {
            const {client, type} = this.props
            if (type) {
                const queries = getTypeQueries(type)
                return client.mutate({
                    mutation: gql(queries.update),
                    /* only send what has changed*/
                    variables: {
                        _version: options && options._version,
                        ...input
                    },
                    update: (store, {data}) => {
                        //window.location.href = window.location.href
                    }
                })
            }
        }
    }

    /**
     * Map the state to props.
     */
    const mapStateToProps = (store) => {
        return {
            user: store.user
        }
    }

    /**
     * Connect the component to
     * the Redux store.
     */
    return connect(
        mapStateToProps
    )(withApollo(Wrapper))

}
