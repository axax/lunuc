import DomUtil from '../../../client/util/dom.mjs'
import Util from '../../../client/util/index.mjs'

export const scrollByHash = (url, options) => {
    if (url.indexOf('#') >= 0 && url.length > 1) {
        const win = window,
            docEl = win.document.documentElement

        let scrollY = win.scrollY

        const checkScroll = (el, tries) => {
            if (el) {
                if(scrollY != win.scrollY){
                    scrollY = win.scrollY
                    //is scrolling
                    setTimeout(()=>{
                        checkScroll(el,tries)
                    },10)
                }else {
                    let {scrollStep, scrollOffset, scrollTimeout} = options
                    let mt = parseInt(win.getComputedStyle(el).marginTop),
                        scrollY = win.scrollY

                    if (isNaN(mt)) {
                        mt = 0
                    }
                    let y = Math.floor(el.getBoundingClientRect().top + win.pageYOffset + (scrollOffset || -mt)),
                        z = docEl.scrollHeight - win.innerHeight

                    if (y > z) {
                        y = z
                    }

                    let step = Math.abs(y - scrollY)
                    if (!scrollStep) {
                        scrollStep = Math.ceil(step / 20)
                    }
                    if (step > scrollStep) {
                        step = scrollStep
                    }
                    let newY = scrollY
                    if (y > scrollY) {
                        newY += step
                    } else {
                        newY -= step
                    }
                    win.scrollTo(0, newY)
                    let tout = 0
                    if (scrollY !== win.scrollY) {
                        tout = scrollTimeout || 10
                    } else if (tries < 30) {
                        tout = 100
                    }
                    if (tout) {
                        scrollY = win.scrollY
                        setTimeout(() => {
                            if(scrollY === win.scrollY) {
                                checkScroll(el, tries+1)
                            }
                        }, tout)
                    }
                }
            }
        }
        DomUtil.waitForElement('#' + decodeURI(url.split('#')[1])).then((el) => {
            // check until postion is reached
            options = Object.assign({}, _app_.scrollOptions, Util.removeNullValues(options, {removeUndefined: true}))
            checkScroll(el, 0)

        }).catch(() => {
        })
    }
}
