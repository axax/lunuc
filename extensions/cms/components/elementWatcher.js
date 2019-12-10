import React from 'react'

export default function elementWatcher({jsonDom, key, eleType, tagName, eleProps, c, $c, scope}, options = {}) {
    // ...and returns another component...
    return class extends React.Component {

        state = {madeVisible: false, initialVisible: tagName === 'SmartImage' ? false : (options.initialClass && !options.waitVisible) || !!options.waitVisible}

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
                return <div _key={key} data-wait-visible={jsonDom.instanceId}>...</div>
            } else {
                if(!eleProps.className){
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
            console.log(ele, key)
            if (ele) {
                let observer = new IntersectionObserver((entries, observer) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            observer.unobserve(entry.target)
                            if (this.state.initialVisible) {
                                ele.classList.add(options.visibleClass)
                            } else {
                                this.setState({madeVisible: true})
                            }

                        }
                    })
                }, {rootMargin: '-100px -100px -100px -100px'})
                observer.observe(ele)
            }
        }

    }
}
