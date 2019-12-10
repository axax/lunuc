import React from 'react'

export default function elementWatcher({jsonDom, key, eleType, eleProps, c, $c, scope}, options = {}) {
    // ...and returns another component...
    return class extends React.Component {


        state = {isVisible: false}

        constructor(props) {
            super(props)
        }

        componentDidMount() {
            setTimeout(()=> {
                this.addIntersectionObserver()
            },0)
        }

        render() {
            if (!options.visibleClass && !this.state.isVisible) {
                return <div _key={key} data-wait-visible={jsonDom.instanceId}>...</div>
            } else {
                if(options.initialClass){
                    eleProps.className = (eleProps.className ? eleProps.className : '')+' '+options.initialClass
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
                            if (options.visibleClass) {
                                console.log(ele, options.visibleClass)
                                ele.classList.add(options.visibleClass)
                            } else {
                                this.setState({isVisible: true})
                            }

                        }
                    })
                }, {rootMargin: '-100px -100px -100px -100px'})
                observer.observe(ele)
            }
        }

    }
}
