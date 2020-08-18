import React from 'react'
import Util from 'client/util'

const hasLoaded = {}
export default function elementWatcher({jsonDom, key, eleType, tagName, eleProps, c, $c, scope}, watchOptions = {}) {

    let tagSrc, tagImg
    if(tagName === 'SmartImage'){
        tagImg = Util.getImageObject(eleProps.src, eleProps.options)
        tagSrc = tagImg.src
    }else{
        tagSrc = jsonDom.instanceId
    }
// ...and returns another component...
    return class extends React.Component {

        state = {
            madeVisible: false,
            initialVisible: tagName === 'SmartImage' ? false : (watchOptions.initialClass && !watchOptions.waitVisible) || !!watchOptions.waitVisible
        }

        constructor(props) {
            super(props)
        }

        componentDidMount() {
            if( !hasLoaded[tagSrc] ) {
                if (!!window.IntersectionObserver) {
                    setTimeout(() => {
                        this.addIntersectionObserver()
                    }, 0)
                } else if (eleProps.inlineSvg) {
                    this.fetchSvg()
                }
            }
        }

        fetchSvg() {
            fetch(tagSrc).then((response) => response.blob()).then((blob) => {
                const reader = new FileReader()

                reader.addEventListener("load", () => {
                    hasLoaded[tagSrc] = {svgData:reader.result}
                    this.setState({madeVisible: true})
                }, false)

                reader.readAsText(blob)
            })
        }

        render() {
            const {initialVisible, madeVisible} = this.state

            if (!initialVisible && !madeVisible && !hasLoaded[tagSrc]) {
                const {_tagName,_options,_WrappedComponent,_scope,_onChange,_onDataResolverPropertyChange, wrapper, inlineSvg, options, id,_inlineEditor, ...rest} = eleProps
                const lazyImage = watchOptions.lazyImage
                if(lazyImage ){
                    const tmpSrc = Util.getImageObject(eleProps.src, {
                        quality:lazyImage.quality || 25,
                        resize:{
                            width:lazyImage.width,
                            height:lazyImage.height
                        },
                        webp:true})
                    return React.createElement(
                        eleType,
                        {...eleProps,src:tmpSrc,alt:(tagImg.alt || eleProps.alt),_key:key},
                        ($c ? null : jsonDom.parseRec(c, key, scope))
                    )
                }
                return <div _key={key} data-wait-visible={jsonDom.instanceId} {...rest} style={{minHeight:'1rem', minWidth:'1rem'}}></div>
            } else {
                if( hasLoaded[tagSrc] && hasLoaded[tagSrc].svgData){
                    eleProps.svgData =hasLoaded[tagSrc].svgData
                }
                if (!eleProps.className) {
                    eleProps.className = ''
                }
                if (madeVisible && watchOptions.visibleClass) {
                    eleProps.className += ' ' + watchOptions.visibleClass
                }
                if (watchOptions.initialClass) {
                    eleProps.className += ' ' + watchOptions.initialClass
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
                        if (entry.isIntersecting ) {

                            observer.unobserve(entry.target)
                            if (this.state.initialVisible) {
                                ele.classList.add(watchOptions.visibleClass)
                            } else {
                                ele.setAttribute('data-loading', true)
                                if (tagName === 'SmartImage') {
                                    if(eleProps.inlineSvg){
                                        this.fetchSvg()
                                    }else {
                                        const img = new Image()

                                        const timeout = setTimeout(() => {
                                            // gifs can be show even if they are not fully loaded
                                            img.onerror = img.onload = null
                                            this.setState({madeVisible: true})
                                        }, 20000)

                                        img.onerror = img.onload = () => {
                                            clearTimeout(timeout)
                                            hasLoaded[tagSrc] = true
                                            this.setState({madeVisible: true})
                                        }

                                        img.src = tagSrc
                                    }

                                } else {

                                    hasLoaded[tagSrc] = true
                                    this.setState({madeVisible: true})
                                }
                            }

                        }
                    })
                }, {rootMargin: watchOptions.rootMargin||'0px 0px 0px 0px'})
                observer.observe(ele)
            }
        }

    }
}
