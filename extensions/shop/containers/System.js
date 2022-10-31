import React from 'react'
import {
    Typography,
    Button
} from 'ui/admin'
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
            _app_.dispatcher.addNotification({
                key: 'shopDataImportate',
                message: response.data.shopImportSampleData.message
            })
        })
    }
}

export default System
