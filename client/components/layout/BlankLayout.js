import React from 'react'
import ErrorHandlerContainer from 'client/containers/ErrorHandlerContainer'
import NotificationContainer from 'client/containers/NotificationContainer'
import {ADMIN_BASE_URL} from 'gen/config'


class BlankLayout extends React.Component {

    render() {
        return <div style={this.props.style}>
                <ErrorHandlerContainer />
                <NotificationContainer />
            {this.props.children}
        </div>
    }
}

export default BlankLayout