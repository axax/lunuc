import React from "react";
import ReactDOM from 'react-dom'


class SmartImage extends React.Component {

    state = {
        isVisible: false,
        hasError: false,
        loaded: false
    }

    componentDidMount() {
        this._ismounted = true
        this.checkVisibility()
    }

    componentWillUnmount() {
        this._ismounted = false;
    }

    componentDidUpdate() {
        if (this._ismounted) {
            const el = ReactDOM.findDOMNode(this)
            if (!this.state.loaded && el.tagName === 'IMG' && el.complete) {
                this.setState({loaded: true})
            }
        }
    }

    shouldComponentUpdate(props, state) {
        return state.isVisible !== this.state.isVisible || state.hasError !== this.state.hasError || state.loaded !== this.state.loaded
    }

    render() {
        const {isVisible, hasError, loaded} = this.state

        if (!isVisible) {
            return <div>hidden</div>
        }

        if (hasError) {
            return <span>Image not available</span>
        }

        return <img data-loading={!loaded} onLoad={this.handleLoad.bind(this)}
                    onError={this.handleError.bind(this)} {...this.props}/>
    }

    handleError() {
        this.setState({hasError: true, loaded: false})
    }

    handleLoad() {
        this.setState({loaded: true})
    }

    checkVisibility() {
        if (this._ismounted) {
            const rect = ReactDOM.findDOMNode(this).getBoundingClientRect()

            const isVisible = rect.bottom > 0 &&
                rect.right > 0 &&
                rect.left < (window.innerWidth || document.documentElement.clientWidth) &&
                rect.top < (window.innerHeight || document.documentElement.clientHeight)


            if (isVisible) {
                this.setState({isVisible})
            } else {
                // check again
                setTimeout(this.checkVisibility.bind(this), 100)
            }
        }
    }

}

export default SmartImage