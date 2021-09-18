import React from 'react'
import Util from 'client/util'


class ElementWatch extends React.Component {
    static hasLoaded = {}
    static loadedSvgData = {}

    constructor(props) {
        super(props)
        this.state = ElementWatch.propsToState(props)
    }


    static getDerivedStateFromProps(nextProps, prevState) {
        if (prevState.oriSrc !== nextProps.eleProps.src) {
            return ElementWatch.propsToState(nextProps, prevState)
        }
        return null
    }

    static propsToState(props, state) {
        const {tagName, eleProps, $observe} = props


        let tagSrc, tagImg
        if (tagName === 'SmartImage') {
            tagImg = Util.getImageObject(eleProps.src, eleProps.options)
            tagSrc = tagImg.src
        } else {
            tagSrc = eleProps.id || props._key
        }
        return {
            oriSrc: eleProps.src,
            tagSrc,
            tagImg,
            madeVisible: state && state.madeVisible ? true : ElementWatch.hasLoaded[tagSrc],
            initialVisible: tagName === 'SmartImage' ? false : ($observe.initialClass && !$observe.waitVisible) || !$observe.waitVisible
        }
    }

    componentDidUpdate(prevProps, prevState, snapshot) {
        if (prevState.tagSrc !== this.state.tagSrc) {
            this.initObserver()
        }
    }

    componentDidMount() {
        this.initObserver()
    }

    initObserver() {
        const {tagSrc} = this.state
        if (!tagSrc || !ElementWatch.hasLoaded[tagSrc]) {
            if (!!window.IntersectionObserver) {
                setTimeout(() => {
                    this.addIntersectionObserver()
                }, 0)
            } else if (this.props.eleProps && this.props.eleProps.inlineSvg) {
                this.fetchSvg()
            }
        }
    }


    render() {
        const {initialVisible, madeVisible, tagImg, tagSrc} = this.state
        const {$observe, eleProps, eleType, jsonDom, _key, c, $c, scope, tagName} = this.props
        if (!initialVisible && !madeVisible && (!tagSrc || !ElementWatch.hasLoaded[tagSrc])) {


            if (tagName === 'SmartImage' && eleProps) {

                let tmpSrc

                const lazyImage = $observe.lazyImage,
                    o = eleProps.options
                if (lazyImage) {
                    tmpSrc = Util.getImageObject(eleProps.src, {
                        quality: lazyImage.quality || 25,
                        resize: {
                            width: lazyImage.width,
                            height: lazyImage.height
                        },
                        webp: true
                    })

                } else if (o && o.resize && o.resize.width && o.resize.height) {
                    tmpSrc = Util.createDummySvg(o.resize.width, o.resize.height)
                }

                if (tmpSrc) {
                    return React.createElement(
                        eleType,
                        {
                            ...eleProps,
                            options: null,
                            src: tmpSrc,
                            alt: (tagImg.alt || eleProps.alt),
                            key: _key + 'watch',
                            'data-element-watch-key': _key,
                            _key
                        },
                        ($c ? null : jsonDom.parseRec(c, _key, scope))
                    )
                }

            }
            return <div data-element-watch-key={_key} data-wait-visible={jsonDom.instanceId}
                        style={{minHeight: '1rem', minWidth: '1rem'}}></div>
        } else {
            if (eleProps.inlineSvg && ElementWatch.loadedSvgData[tagSrc]) {
                eleProps.svgData = ElementWatch.loadedSvgData[tagSrc].data
            }
            eleProps['data-element-watch'] = true
            if ($observe.initialClass || $observe.visibleClass) {
                eleProps['data-element-watch-key'] = _key

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

        if (!tagSrc) {
            return
        }
        let loadedSvgData = ElementWatch.loadedSvgData[tagSrc]
        if(!loadedSvgData){
            loadedSvgData = ElementWatch.loadedSvgData[tagSrc] = {loading: false, data: false, cb:[]}
        }

        if(loadedSvgData.data){
            this.setState({madeVisible: true})
        }else if(loadedSvgData.loading){
            loadedSvgData.cb.push(()=>{
                this.setState({madeVisible: true})
            })
        }else{

            loadedSvgData.loading = true
            fetch(tagSrc).then((response) => response.blob()).then((blob) => {
                const reader = new FileReader()

                reader.addEventListener("load", () => {
                    loadedSvgData.data = reader.result
                    ElementWatch.hasLoaded[tagSrc] = true
                    this.setState({madeVisible: true})

                    while(loadedSvgData.cb.length>0){
                        let cb = loadedSvgData.cb.shift()
                        cb()
                    }

                }, false)

                reader.readAsText(blob)
            })


        }
    }


    makeVisible(ele) {
        const {tagSrc} = this.state
        const {$observe, eleProps, _key, tagName} = this.props
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
                        if (!$observe.waitVisible) {
                            ElementWatch.hasLoaded[tagSrc] = true
                        }
                        this.setState({madeVisible: true})
                    }

                    img.src = tagSrc
                }

            } else {

                if (tagSrc && !$observe.waitVisible) {
                    ElementWatch.hasLoaded[tagSrc] = true
                }
                this.setState({madeVisible: true})
            }
        }
    }

    addIntersectionObserver() {
        const {$observe, _key} = this.props

        const ele = document.querySelector(`[data-element-watch-key='${_key}']`)

        if (ele) {
            if (_app_.JsonDom._elementWatchForceVisible || window._elementWatchForceVisible) {
                this.makeVisible(ele)
            } else {
                let observer = new IntersectionObserver((entries, observer) => {
                    entries.forEach(entry => {
                        //console.log(_key, entry.intersectionRatio)
                        if (entry.isIntersecting) {
                            observer.unobserve(entry.target)

                            this.makeVisible(ele)
                        }
                    })
                }, {rootMargin: $observe.rootMargin || '0px 0px 0px 0px', threshold: $observe.threshold || 0})
                observer.observe(ele)
            }
        }
    }
}


export default ElementWatch

