import React from 'react'
import ErrorHandler from './ErrorHandler'
import NotificationHandler from './NotificationHandler'
import NetworkStatusHandler from './NetworkStatusHandler'
import {UIProvider} from 'ui/admin'


class BlankLayout extends React.Component {

    render() {
        return <UIProvider>
            <div style={this.props.style}>
                <NetworkStatusHandler />
                <ErrorHandler />
                <NotificationHandler />
                {this.props.children}
            </div>
        </UIProvider>
    }
}

export default BlankLayout