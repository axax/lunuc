import React from 'react'
import Util from 'client/util'


class ElementWatch extends React.Component {
    static hasLoaded = {}

    constructor(props) {
        super(props)

        const {tagName, eleProps, $observe} = props


        let tagSrc, tagImg
        if (tagName === 'SmartImage') {
            tagImg = Util.getImageObject(eleProps.src, eleProps.options)
            tagSrc = tagImg.src
        } else {
            tagSrc = eleProps.id
        }

        this.state = {
            tagSrc,
            tagImg,
            madeVisible: false,
            initialVisible: tagName === 'SmartImage' ? false : ($observe.initialClass && !$observe.waitVisible) || !!$observe.waitVisible
        }
    }

    componentDidMount() {
        const {tagSrc} = this.state
        const {eleProps} = this.props

        if (!tagSrc || !ElementWatch.hasLoaded[tagSrc]) {
            if (!!window.IntersectionObserver) {
                setTimeout(() => {
                    this.addIntersectionObserver()
                }, 0)
            } else if (eleProps.inlineSvg) {
                this.fetchSvg()
            }
        }
    }


    render() {
        const {initialVisible, madeVisible, tagImg, tagSrc} = this.state
        const {$observe, eleProps, eleType, jsonDom, _key, c, $c, scope} = this.props
        if (!initialVisible && !madeVisible && (!tagSrc || !ElementWatch.hasLoaded[tagSrc])) {

            const lazyImage = $observe.lazyImage
            if (lazyImage) {
                const tmpSrc = Util.getImageObject(eleProps.src, {
                    quality: lazyImage.quality || 25,
                    resize: {
                        width: lazyImage.width,
                        height: lazyImage.height
                    },
                    webp: true
                })
                return React.createElement(
                    eleType,
                    {
                        ...eleProps,
                        options: null,
                        src: tmpSrc,
                        alt: (tagImg.alt || eleProps.alt),
                        key: _key + 'watch',
                        _key
                    },
                    ($c ? null : jsonDom.parseRec(c, _key, scope))
                )
            }

            return <div _key={_key} data-wait-visible={jsonDom.instanceId}
                        style={{minHeight: '1rem', minWidth: '1rem'}}></div>
        } else {

            if (ElementWatch.hasLoaded[tagSrc] && ElementWatch.hasLoaded[tagSrc].svgData) {
                eleProps.svgData = ElementWatch.hasLoaded[tagSrc].svgData
            }

            if ($observe.initialClass || $observe.visibleClass) {
                // we change props here so components get updated
                if (!eleProps.className) {
                    eleProps.className = ''
                }
                if (madeVisible && $observe.visibleClass) {
                    eleProps.className += ' ' + $observe.visibleClass
                }
                if ($observe.initialClass) {
                    eleProps.className += ' ' + $observe.initialClass
                }
            }
            return React.createElement(
                eleType,
                eleProps,
                ($c ? null : jsonDom.parseRec(c, _key, scope))
            )
        }
    }


    fetchSvg() {

        const {tagImg, tagSrc} = this.state

        fetch(tagSrc).then((response) => response.blob()).then((blob) => {
            const reader = new FileReader()

            reader.addEventListener("load", () => {
                ElementWatch.hasLoaded[tagSrc] = {svgData: reader.result}
                this.setState({madeVisible: true})
            }, false)

            reader.readAsText(blob)
        })
    }

    addIntersectionObserver() {
        const {tagSrc} = this.state
        const {$observe, eleProps, _key, tagName} = this.props

        const ele = document.querySelector(`[_key='${_key}']`)
        if (ele) {
            let observer = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {

                        observer.unobserve(entry.target)
                        if (this.state.initialVisible) {
                            ele.classList.add($observe.visibleClass)
                        } else {
                            ele.setAttribute('data-loading', true)
                            if (tagName === 'SmartImage') {
                                if (eleProps.inlineSvg) {
                                    this.fetchSvg()
                                } else {
                                    const img = new Image()

                                    const timeout = setTimeout(() => {
                                        // gifs can be show even if they are not fully loaded
                                        img.onerror = img.onload = null
                                        this.setState({madeVisible: true})
                                    }, 20000)

                                    img.onerror = img.onload = () => {
                                        clearTimeout(timeout)
                                        ElementWatch.hasLoaded[tagSrc] = true
                                        this.setState({madeVisible: true})
                                    }

                                    img.src = tagSrc
                                }

                            } else {

                                if (tagSrc) {
                                    ElementWatch.hasLoaded[tagSrc] = true
                                }
                                this.setState({madeVisible: true})
                            }
                        }

                    }
                })
            }, {rootMargin: $observe.rootMargin || '0px 0px 0px 0px'})
            observer.observe(ele)
        }
    }
}


export default ElementWatch

