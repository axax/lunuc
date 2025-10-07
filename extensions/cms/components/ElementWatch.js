import React from 'react'
import Util from 'client/util/index.mjs'


class ElementWatch extends React.Component {
    static hasLoaded = {}
    static loadedSvgData = {}

    constructor(props) {
        super(props)
        this.state = ElementWatch.propsToState(props)
    }


    static getDerivedStateFromProps(nextProps, prevState) {
        if (prevState.oriSrc !== nextProps.eleProps.src ||
        prevState.href !== nextProps?.jsonDom?.location?.href) {
            return ElementWatch.propsToState(nextProps, prevState)
        }
        return null
    }

    static propsToState(props, state = {}) {
        const {tagName, eleProps, $observe, _key} = props

        let tagSrc, tagImg
        if (tagName === 'SmartImage') {
            tagImg = Util.getImageObject(eleProps.src, eleProps.options)
            tagSrc = tagImg.src + (eleProps.inlineSvg?'#inlinesvg':'')
        } else {
            tagSrc = eleProps.id || _key
        }

        const href = props?.jsonDom?.props?.location?.href
        const hasMadeVisibleClass = $observe.initialClass && $observe.visibleClass && href !== state.href

        if(hasMadeVisibleClass){
            ElementWatch.hasLoaded[tagSrc] = false
        }

        const isAlreadyMadeVisible = state.madeVisible && tagName !== 'SmartImage'? true : ElementWatch.hasLoaded[tagSrc]


        return {
            href,
            oriSrc: eleProps.src,
            tagSrc,
            tagImg,
            inViewport:false,
            inFlipMode:false,
            hasError:false,
            key: _key,
            madeVisible: isAlreadyMadeVisible && !hasMadeVisibleClass,
            initialVisible: tagName === 'SmartImage' ? false : !$observe.waitVisible
        }
    }

    componentDidUpdate(prevProps, prevState, snapshot) {

        if (prevState.tagSrc !== this.state.tagSrc ||
            (!this.state.madeVisible && prevState.madeVisible) ||
            (prevProps.$observe.flipMode && this.state.madeVisible && !this.state.inFlipMode)) {
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
        const {initialVisible, madeVisible, inFlipMode, inViewport, hasError, tagImg, tagSrc, key} = this.state
        const {$observe, eleProps, eleType, jsonDom, c, $c, scope, tagName, _key} = this.props
        const observeBgImage = $observe.backgroundImage

        if (!initialVisible && !madeVisible && !observeBgImage && (!tagSrc || !ElementWatch.hasLoaded[tagSrc])) {

            let allClassNames = eleProps.className || ''
            if ($observe.initialClass) {
                allClassNames += ' ' + $observe.initialClass
            }

            if (tagName === 'SmartImage' && eleProps) {

                let tmpSrc

                const lazyImage = $observe.lazyImage,
                    o = eleProps.options
                const hasValidLazyImage = lazyImage && (lazyImage.width || lazyImage.height)

                let w, h
                if (o && o.resize && o.resize.width && o.resize.height) {
                    w = o.resize.width
                    h = o.resize.height
                } else if (eleProps.width && eleProps.height) {
                    w = eleProps.width
                    h = eleProps.height
                }else if(!hasValidLazyImage){
                    const data = Util.getImageObject(eleProps.src)
                    if(data.width && data.height){
                        w = data.width
                        h = data.height
                    }
                }
                if (hasValidLazyImage) {
                    tmpSrc = Util.getImageObject(eleProps.src, {
                        quality: lazyImage.quality || 25,
                        resize: {
                            width: lazyImage.width,
                            height: lazyImage.height
                        },
                        webp: true
                    })
                } else if (w && h) {
                    tmpSrc = Util.createDummySvg(w,h,o && o.dummyColor ? o.dummyColor :  _app_.JsonDom.dummyImageColor)
                }

                if (tmpSrc) {
                    return React.createElement(
                        eleType,
                        {
                            width:w,
                            height:h,
                            ...eleProps,
                            className:allClassNames,
                            options: null,
                            src: tmpSrc,
                            alt: (tagImg.alt || eleProps.alt),
                            'data-has-error': hasError,
                            'data-element-watch-key': key,
                            key
                        },
                        ($c ? null : jsonDom.parseRec(c, _key, scope))
                    )
                }

            }

            const propsToPass = {className:allClassNames, key}
            if($observe.passProps) {
                Object.keys(eleProps).forEach(propKey => {
                    if (propKey.startsWith('data') || propKey=='style') {
                        propsToPass[propKey] = eleProps[propKey]
                    }
                })
            }

            return <div data-element-watch-key={key} data-wait-visible={jsonDom.instanceId}
                        style={{minHeight: eleProps.style && eleProps.style.minHeight ? eleProps.style.minHeight:'1rem', minWidth: '1rem'}} {...propsToPass}></div>
        } else {
            const newEleProps = Object.assign({},eleProps, {
                key,
                'data-has-error': hasError,
                'data-made-visible': madeVisible,
                'data-element-watch':true})

            if (newEleProps.inlineSvg && ElementWatch.loadedSvgData[tagSrc]) {
                newEleProps.svgData = ElementWatch.loadedSvgData[tagSrc].data
            }
            if ($observe.initialClass || $observe.visibleClass) {
                newEleProps['data-element-watch-key'] = key
                if(!newEleProps.className){
                    newEleProps.className = ''
                }
                // we change props here so components get updated
                if (madeVisible && $observe.visibleClass && (!inFlipMode || inViewport)) {
                    newEleProps.className += ' ' + $observe.visibleClass
                }
                if ($observe.initialClass) {
                    newEleProps.className += ' ' + $observe.initialClass
                }
            }
            if(observeBgImage && !madeVisible){
                // set background image when element gets visible
                newEleProps.style = {backgroundImage:''}
                newEleProps['data-element-watch-key'] = key
            }
            return React.createElement(
                eleType,
                newEleProps,
                ($c ? null : jsonDom.parseRec(c, _key, scope))
            )
        }
    }


    fetchSvg() {
        const {tagSrc} = this.state

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

                reader.addEventListener('load', () => {
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
        const {$observe, eleProps, tagName, jsonDom} = this.props

        const madeVisibleDelay = ()=>{
            setTimeout(()=>{
                this.setState({madeVisible: true})
            }, $observe.delay || 0)
        }
        if (this.state.initialVisible) {
            if($observe.visibleClass) {
                madeVisibleDelay()
                /*setTimeout(()=>{
                    this.setState({madeVisible: true})
                  //  ele.classList.add(...$observe.visibleClass.split(' '))
                }, $observe.delay || 0)*/
            }
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

                    const onEnd = () => {
                        clearTimeout(timeout)
                        if (!$observe.waitVisible || jsonDom.props.inEditor) { // jsonDom.props.inEditor check prevents flickering in cms editor
                            ElementWatch.hasLoaded[tagSrc] = true
                        }
                        madeVisibleDelay()
                    }

                    img.onerror = ()=>{
                        this.setState({hasError: true})
                        onEnd()
                    }
                    img.onload = onEnd

                    img.src = tagSrc
                }

            } else {

                if (tagSrc && (!$observe.waitVisible || jsonDom.props.inEditor)) {
                    ElementWatch.hasLoaded[tagSrc] = true
                }
                madeVisibleDelay()
            }
        }
    }

    addIntersectionObserver() {
        const {key, madeVisible} = this.state
        const {$observe} = this.props

        const ele = document.querySelector(`[data-element-watch-key='${key}']`)
        if (ele) {
            if (_app_.JsonDom._elementWatchForceVisible || window._elementWatchForceVisible) {
                this.makeVisible(ele)
            } else {
                let observer = new IntersectionObserver((entries, observer) => {
                    entries.forEach(entry => {

                        if($observe.flipMode && madeVisible) {
                            this.setState({inFlipMode:true, inViewport:entry.isIntersecting})
                        }else if (entry.isIntersecting) {
                            observer.unobserve(entry.target)
                            this.makeVisible(ele)
                        }
                    })
                }, {rootMargin: $observe.rootMargin || '0px 0px 0px 0px', threshold: $observe.threshold || 0})
                observer.observe(ele)
            }
        }else{
            console.warn(`element is missing for observer`, key, this.props)
        }
    }
}


export default ElementWatch

