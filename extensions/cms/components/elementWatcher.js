import React from 'react'
import Util from 'client/util'

export default function elementWatcher({jsonDom, key, eleType, tagName, eleProps, c, $c, scope}, options = {}) {
    // ...and returns another component...
    return class extends React.Component {

        state = {
            madeVisible: false,
            initialVisible: tagName === 'SmartImage' ? false : (options.initialClass && !options.waitVisible) || !!options.waitVisible
        }

        constructor(props) {
            super(props)
        }

        componentDidMount() {
            setTimeout(() => {
                this.addIntersectionObserver()
            }, 0)
        }

        render() {
            const {initialVisible, madeVisible} = this.state
            if (!initialVisible && !madeVisible) {
                const {_tagName,_inlineEditor,_WrappedComponent,_scope,_onChange,_onDataResolverPropertyChange, ...rest} = eleProps
                return <div _key={key} style={{minHeight:'1rem'}} data-wait-visible={jsonDom.instanceId} {...rest}></div>
            } else {
                if (!eleProps.className) {
                    eleProps.className = ''
                }
                if (madeVisible && options.visibleClass) {
                    eleProps.className += ' ' + options.visibleClass
                }
                if (options.initialClass) {
                    eleProps.className += ' ' + options.initialClass
                }
                return React.createElement(
                    eleType,
                    eleProps,
                    ($c ? null : jsonDom.parseRec(c, key, scope))
                )
            }
        }

        addIntersectionObserver() {
            const ele = document.querySelector(`[_key='${key}']`)
            if (ele) {
                let observer = new IntersectionObserver((entries, observer) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            observer.unobserve(entry.target)
                            if (this.state.initialVisible) {
                                ele.classList.add(options.visibleClass)
                            } else {
                                ele.setAttribute('data-loading', true);
                                if (tagName === 'SmartImage') {
                                    const img = new Image()

                                    const timeout = setTimeout(()=>{
                                        // gifs can be show even if they are not fully loaded
                                        img.onerror = img.onload = null
                                        this.setState({madeVisible: true})
                                    },1000)

                                    img.onerror = img.onload = () => {
                                        clearTimeout(timeout)
                                        this.setState({madeVisible: true})
                                    }

                                    img.src = Util.getImageObject(eleProps.src).src

                                } else {
                                    this.setState({madeVisible: true})
                                }
                            }

                        }
                    })
                }, {rootMargin: options.rootMargin||'0px'})
                observer.observe(ele)
            }
        }

    }
}
