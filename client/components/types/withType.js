import React from 'react'
import {connect} from 'react-redux'
import {getTypeQueries} from 'util/types'
import {client} from '../../middleware/graphql'


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
            const {type} = this.props
            if (type) {
                const queries = getTypeQueries(type)
                return client.mutate({
                    mutation: queries.create,
                    variables: {
                        _version: options && options._version,
                        ...input
                    },
                    update: (store, {data}) => {
                    }
                })
            }
        }


        updateData(input, optimisticInput, options) {
            const {type} = this.props
            if (type) {
                const queries = getTypeQueries(type)
                return client.mutate({
                    mutation: queries.update,
                    /* only send what has changed*/
                    variables: {
                        _version: options && options._version,
                        ...input
                    },
                    update: (store, {data}) => {
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
    )(Wrapper)

}
