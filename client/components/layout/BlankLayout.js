import React from 'react'
import ErrorHandler from './ErrorHandler'
import NotificationHandler from './NotificationHandler'
import NetworkStatusHandler from './NetworkStatusHandler'


class BlankLayout extends React.Component {

    render() {
        return <div style={this.props.style}>
            <NetworkStatusHandler />
            <ErrorHandler />
            <NotificationHandler />
            {this.props.children}
        </div>
    }
}

export default BlankLayout