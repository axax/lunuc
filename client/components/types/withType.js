import React from 'react'
import {getTypeQueries} from 'util/types.mjs'
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


        updateData(input, optimisticInput, metaData) {
            const {type} = this.props
            if (type) {
                const queries = getTypeQueries(type)
                return client.mutate({
                    mutation: queries.update,
                    /* only send what has changed*/
                    variables: {
                        _version: metaData && metaData._version,
                        _meta: metaData && metaData.data,
                        ...input
                    },
                    update: (store, {data}) => {
                    }
                })
            }
        }
    }

    return Wrapper

}
