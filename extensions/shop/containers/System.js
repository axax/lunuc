import React from 'react'
import {bindActionCreators} from 'redux'
import {connect} from 'react-redux'
import {gql} from '@apollo/client'
import {
    Typography,
    Button
} from 'ui/admin'
import {withApollo} from '@apollo/react-hoc'
import PropTypes from 'prop-types'
import { ApolloClient } from '@apollo/client'
import * as NotificationAction from 'client/actions/NotificationAction'

class System extends React.Component {


    constructor(props) {
        super(props)
    }

    render() {


        return <div><Typography>Add some sample data (around 20'000 products and 9000 categories) by clicking on the button
            below.</Typography>
            <Button variant="contained" color="primary" onClick={this.startImport.bind(this)}>Import sample
                data</Button></div>
    }


    startImport() {
        this.props.client.query({
            fetchPolicy: 'no-cache',
            query: gql(`{shopImportSampleData{status message}}`)

        }).then(response => {
            this.props.notificationAction.addNotification({
                key: 'shopDataImportate',
                message: response.data.shopImportSampleData.message
            })
        })
    }
}


System.propTypes = {
    client: PropTypes.instanceOf(ApolloClient).isRequired,
    notificationAction: PropTypes.object.isRequired
}


/**
 * Map the state to props.
 */
const mapStateToProps = () => {
    return {}
}

/**
 * Map the actions to props.
 */
const mapDispatchToProps = (dispatch) => ({
    notificationAction: bindActionCreators(NotificationAction, dispatch)
})


/**
 * Connect the component to
 * the Redux store.
 */
export default connect(
    mapStateToProps,
    mapDispatchToProps
)(withApollo(System))
