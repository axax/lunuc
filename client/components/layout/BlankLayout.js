import React from 'react'
import 'gen/extensions-client-admin'
import ErrorHandler from './ErrorHandler'
import NotificationHandler from './NotificationHandler'
import NetworkStatusHandler from './NetworkStatusHandler'
import {UIProvider} from 'ui/admin'

import {registerTrs} from 'util/i18n.mjs'
import {translations} from '../../translations/admin'
registerTrs(translations, 'AdminTranslations')

class BlankLayout extends React.Component {

    render() {
        console.log('render BlankLayout')
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
