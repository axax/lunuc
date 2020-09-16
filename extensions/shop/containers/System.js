import React from 'react'
import {bindActionCreators} from 'redux'
import {connect} from 'react-redux'
import {
    Typography,
    Button
} from 'ui/admin'
import PropTypes from 'prop-types'
import * as NotificationAction from 'client/actions/NotificationAction'
import {client} from '../../../client/middleware/graphql'

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
        client.query({
            fetchPolicy: 'no-cache',
            query: '{shopImportSampleData{status message}}'

        }).then(response => {
            this.props.notificationAction.addNotification({
                key: 'shopDataImportate',
                message: response.data.shopImportSampleData.message
            })
        })
    }
}


System.propTypes = {
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
)(System)
