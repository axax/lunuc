import React from 'react'
import ReactDOM from 'react-dom'
import PropTypes from 'prop-types'


class SmartImage extends React.Component {

    propTypes = {
        src: PropTypes.string,
        asBackground: PropTypes.bool,
        className: PropTypes.string,
        style: PropTypes.object
    }

    constructor(props) {
        super(props)
        this.state = SmartImage.getStateFromProps(props)
    }

    static getDerivedStateFromProps(nextProps, prevState) {
        if (nextProps.src !== prevState.src) {
            return SmartImage.getStateFromProps(nextProps)
        }
        return null
    }

    static getStateFromProps(props) {
        return {
            src: props.src,
            isVisible: false,
            hasError: false,
            loaded: false
        }
    }

    componentDidMount() {
        this._ismounted = true
        this.checkVisibility()
    }

    componentWillUnmount() {
        this._ismounted = false
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
        if (this.state.src !== state.src) {
            this.checkVisibility()
        }
        return this.state.src !== state.src || state.isVisible !== this.state.isVisible || state.hasError !== this.state.hasError || state.loaded !== this.state.loaded
    }

    render() {
        const {isVisible, hasError, loaded} = this.state
        const {asBackground, className, style, ...rest} = this.props

        if (!isVisible) {
            return <div>hidden</div>
        }

        if (hasError) {
            return <span>Image not available</span>
        }
        if (asBackground) {
            return <div className={className} data-loading={!loaded}
                        style={{backgroundImage: 'url(' + this.props.src + ')', ...style}}>
                <img style={{opacity: 0}} onLoad={this.handleLoad.bind(this)}
                     onError={this.handleError.bind(this)} {...rest}/>
            </div>
        } else {
            return <img data-loading={!loaded} onLoad={this.handleLoad.bind(this)}
                        className={className}
                        style={style}
                        onError={this.handleError.bind(this)} {...rest}/>
        }
    }

    handleError() {
        this.setState({hasError: true, loaded: false})
    }

    handleLoad() {
        this.setState({loaded: true})
    }

    checkVisibility() {
        if (this._ismounted) {
            const el = ReactDOM.findDOMNode(this)
            const style = window.getComputedStyle(el)

            let isVisible = style.width !== '0' &&
                style.height !== '0' &&
                style.opacity !== '0' &&
                style.display !== 'none' &&
                style.visibility !== 'hidden'

            if (isVisible) {
                // is it in viewport

                const rect = el.getBoundingClientRect()
                isVisible = rect.bottom > 0 &&
                    rect.right > 0 &&
                    rect.left < (window.innerWidth || document.documentElement.clientWidth) &&
                    rect.top < (window.innerHeight || document.documentElement.clientHeight)
            }


            if (isVisible) {
                this.setState({isVisible})
                setTimeout(() => {
                    if (this._ismounted && !this.state.loaded) {
                        console.log('image load timeout')
                        // timeout
                        this.setState({hasError: true, loaded: false})
                    }
                }, 10000)
            } else {
                // check again
                setTimeout(this.checkVisibility.bind(this), 150)
            }
        }
    }

}

export default SmartImage