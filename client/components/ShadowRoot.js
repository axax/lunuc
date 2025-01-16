import React from 'react'


export class ShadowRoot extends React.Component {

    attachShadow(host) {
        this.host = host
        if (this.host && !this.host.shadowRoot) {
            this.host.attachShadow({mode: 'open'})
        }
        this.updateShadowDom()
    }

    updateShadowDom(){
        if(this.host) {
            this.host.shadowRoot.innerHTML = this.props.dangerouslySetInnerHTML ? this.props.dangerouslySetInnerHTML.__html : ''
        }
    }

    componentDidUpdate() {
        this.updateShadowDom()
    }

    render() {
        const {dangerouslySetInnerHTML,...rest} = this.props
        return (
            <span {...this.props} ref={this.attachShadow.bind(this)} />
        )
    }
}

export default ShadowRoot