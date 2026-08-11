import React from 'react'
import Util from 'client/util/index.mjs'

// Shared IntersectionObserver pool.
// One observer instance per unique option set instead of one observer per watched
// element. Behaviour is identical, but memory and callback overhead is much lower
// on pages with many lazy loaded elements.
const observerPool = new Map()

const getPooledObserver = (rootMargin, threshold) => {
    const poolKey = rootMargin + '|' + threshold
    let pooled = observerPool.get(poolKey)
    if (!pooled) {
        const callbacks = new WeakMap()
        pooled = {
            callbacks,
            observer: new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    const targetCallbacks = callbacks.get(entry.target)
                    if (targetCallbacks) {
                        // copy, a callback may unobserve itself while iterating
                        Array.from(targetCallbacks).forEach(cb => cb(entry))
                    }
                })
            }, {rootMargin, threshold})
        }
        observerPool.set(poolKey, pooled)
    }
    return pooled
}


class ElementWatch extends React.Component {
    static hasLoaded = {}
    static loadedSvgData = {}

    _isMounted = false
    _observed = []
    _timeouts = new Set()
    _image = null

    constructor(props) {
        super(props)
        this.state = ElementWatch.propsToState(props)
    }


    static getDerivedStateFromProps(nextProps, prevState) {
        if (prevState.oriSrc !== nextProps.eleProps.src ||
            (prevState.href !== nextProps?.jsonDom?.props?.location?.href)) {
            return ElementWatch.propsToState(nextProps, prevState)
        }
        return null
    }

    static propsToState(props, state = {}) {
        const {tagName, eleProps, $observe, _key} = props

        let tagSrc, tagImg, isVideo = false
        if (tagName === 'SmartImage') {
            tagImg = Util.getImageObject(eleProps.src, eleProps.options)
            tagSrc = tagImg.src + (eleProps.inlineSvg ? '#inlinesvg' : '')
            isVideo = tagImg?.mimeType?.startsWith('video/')
        } else {
            tagSrc = eleProps.id || _key
        }

        const href = props?.jsonDom?.props?.location?.href
        const hasMadeVisibleClass = $observe.initialClass && $observe.visibleClass && href !== state.href

        if (hasMadeVisibleClass) {
            ElementWatch.hasLoaded[tagSrc] = false
        }

        const isAlreadyMadeVisible = state.madeVisible && tagName !== 'SmartImage' ? true : ElementWatch.hasLoaded[tagSrc]


        return {
            href,
            oriSrc: eleProps.src,
            tagSrc,
            tagImg,
            inViewport: false,
            inFlipMode: false,
            hasError: false,
            key: _key,
            madeVisible: (isAlreadyMadeVisible && !hasMadeVisibleClass) || (_app_.JsonDom.elementWatchForceVisible && !eleProps.inlineSvg),
            initialVisible: tagName === 'SmartImage' ? isVideo : !$observe.waitVisible
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
        this._isMounted = true
        this.initObserver()
    }

    componentWillUnmount() {
        this._isMounted = false
        this.unobserveAll()
        this._timeouts.forEach(id => clearTimeout(id))
        this._timeouts.clear()
        if (this._image) {
            this._image.onload = this._image.onerror = null
            this._image = null
        }
    }

    // prevents setState calls from timers, image events and fetch callbacks
    // after the component has been unmounted
    setStateSafe(state) {
        if (this._isMounted) {
            this.setState(state)
        }
    }

    setTimeoutSafe(fn, delay) {
        const id = setTimeout(() => {
            this._timeouts.delete(id)
            fn()
        }, delay)
        this._timeouts.add(id)
        return id
    }

    initObserver() {
        const {tagSrc} = this.state
        if (!tagSrc || !ElementWatch.hasLoaded[tagSrc]) {
            if (!!window.IntersectionObserver) {
                this.setTimeoutSafe(() => {
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
                } else if (!hasValidLazyImage) {
                    const data = Util.getImageObject(eleProps.src)
                    if (data.width && data.height) {
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
                    tmpSrc = Util.createDummySvg(w, h, o && o.dummyColor ? o.dummyColor : _app_.JsonDom.dummyImageColor)
                }

                if (tmpSrc) {
                    return React.createElement(
                        eleType,
                        {
                            width: w,
                            height: h,
                            ...eleProps,
                            className: allClassNames,
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

            const propsToPass = {className: allClassNames, key}
            if ($observe.passProps) {
                Object.keys(eleProps).forEach(propKey => {
                    if (propKey.startsWith('data') || propKey == 'style') {
                        propsToPass[propKey] = eleProps[propKey]
                    }
                })
            }

            return <div data-element-watch-key={key} data-wait-visible={jsonDom.instanceId}
                        style={{
                            minHeight: eleProps.style && eleProps.style.minHeight ? eleProps.style.minHeight : '1rem',
                            minWidth: '1rem'
                        }} {...propsToPass}></div>
        } else {
            const newEleProps = Object.assign({}, eleProps, {
                key,
                'data-has-error': hasError,
                'data-made-visible': madeVisible,
                'data-element-watch': true
            })

            if (newEleProps.inlineSvg && ElementWatch.loadedSvgData[tagSrc]) {
                newEleProps.svgData = ElementWatch.loadedSvgData[tagSrc].data
            }
            if ($observe.initialClass || $observe.visibleClass) {
                newEleProps['data-element-watch-key'] = key
                if (!newEleProps.className) {
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
            if (observeBgImage && !madeVisible) {
                // set background image when element gets visible
                newEleProps.style = {backgroundImage: ''}
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
        if (!loadedSvgData) {
            loadedSvgData = ElementWatch.loadedSvgData[tagSrc] = {loading: false, data: false, cb: []}
        }

        if (loadedSvgData.data) {
            this.setStateSafe({madeVisible: true})
        } else if (loadedSvgData.loading) {
            loadedSvgData.cb.push(() => {
                this.setStateSafe({madeVisible: true})
            })
        } else {

            loadedSvgData.loading = true
            fetch(tagSrc).then(response => response.text()).then(data => {
                loadedSvgData.data = data
                loadedSvgData.loading = false
                ElementWatch.hasLoaded[tagSrc] = true
                this.setStateSafe({madeVisible: true})

                while (loadedSvgData.cb.length > 0) {
                    const cb = loadedSvgData.cb.shift()
                    cb()
                }
            }).catch(error => {
                // release the lock, otherwise all other instances of the same svg
                // would wait forever and a later mount could never retry
                loadedSvgData.loading = false
                loadedSvgData.cb.length = 0
                console.warn('ElementWatch: unable to load inline svg', tagSrc, error)
            })
        }
    }


    makeVisible(ele) {
        const {tagSrc} = this.state
        const {$observe, eleProps, tagName, jsonDom} = this.props

        const madeVisibleDelay = () => {
            this.setTimeoutSafe(() => {
                this.setStateSafe({madeVisible: true})
            }, $observe.delay || 0)
        }
        if (this.state.initialVisible) {
            if ($observe.visibleClass) {
                madeVisibleDelay()
            }
        } else {
            ele.setAttribute('data-loading', true)
            if (tagName === 'SmartImage') {
                if (eleProps.inlineSvg) {
                    this.fetchSvg()
                } else {
                    const img = this._image = new Image()

                    const timeout = this.setTimeoutSafe(() => {
                        // gifs can be shown even if they are not fully loaded
                        img.onerror = img.onload = null
                        this._image = null
                        ele.setAttribute('data-loading', false)
                        this.setStateSafe({madeVisible: true})
                    }, 20000)

                    const onEnd = () => {
                        clearTimeout(timeout)
                        this._timeouts.delete(timeout)
                        this._image = null
                        if (!$observe.waitVisible || jsonDom.props.inEditor) { // jsonDom.props.inEditor check prevents flickering in cms editor
                            ElementWatch.hasLoaded[tagSrc] = true
                        }
                        madeVisibleDelay()
                        ele.setAttribute('data-loading', false)
                    }

                    img.onerror = () => {
                        this.setStateSafe({hasError: true})
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
        if (!this._isMounted) {
            return
        }
        const {key, madeVisible} = this.state
        const {$observe} = this.props

        // drop observers of a previous run, otherwise they pile up on src changes
        this.unobserveAll()

        const eles = document.querySelectorAll(`[data-element-watch-key='${key}']`)
        eles.forEach(ele => {
            if (_app_.JsonDom.elementWatchForceVisible) {
                this.makeVisible(ele)
            } else {
                const pooled = getPooledObserver(
                    $observe.rootMargin || '0px 0px 0px 0px',
                    $observe.threshold || 0
                )
                const item = {pooled, target: ele}
                item.callback = (entry) => {
                    if ($observe.flipMode && madeVisible) {
                        this.setStateSafe({inFlipMode: true, inViewport: entry.isIntersecting})
                    } else if (entry.isIntersecting) {
                        this.unobserve(item)
                        this.makeVisible(ele)
                    }
                }

                let targetCallbacks = pooled.callbacks.get(ele)
                if (!targetCallbacks) {
                    targetCallbacks = new Set()
                    pooled.callbacks.set(ele, targetCallbacks)
                }
                targetCallbacks.add(item.callback)

                pooled.observer.observe(ele)
                this._observed.push(item)
            }
        })
    }

    unobserve(item) {
        const {pooled, target, callback} = item
        const targetCallbacks = pooled.callbacks.get(target)
        if (targetCallbacks) {
            targetCallbacks.delete(callback)
            if (targetCallbacks.size === 0) {
                pooled.callbacks.delete(target)
                pooled.observer.unobserve(target)
            }
        }
        this._observed = this._observed.filter(o => o !== item)
    }

    unobserveAll() {
        // copy, unobserve modifies _observed
        Array.from(this._observed).forEach(item => this.unobserve(item))
        this._observed = []
    }
}


export default ElementWatch