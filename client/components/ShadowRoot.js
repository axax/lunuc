import React from 'react'


export class ShadowRoot extends React.Component {

    attachShadow(host) {
        if (host == null) {
            return
        }
        host.attachShadow({mode: 'open'})
        host.shadowRoot.innerHTML = host.innerHTML
        host.innerHTML = ''
    }

    render() {
        return (
            <span {...this.props} ref={this.attachShadow} />
        )
    }
}

export default ShadowRoot