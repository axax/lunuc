import DomUtil from '../../../client/util/dom.mjs'
import Util from '../../../client/util/index.mjs'



let manualScroll
const manualScrollEvent = ()=>{
    manualScroll = true
}
const addScrollEvent = ()=>{
    if(manualScroll===undefined) {
        const ael = window.addEventListener
        ael('mousewheel', manualScrollEvent)
        ael('DOMMouseScroll', manualScrollEvent)
        ael('touchmove', manualScrollEvent)
    }
    manualScroll = false
}
const checkScroll = (el, options, tries) => {
    // only check if element exist and user has not scrolled manually
    if (el && !manualScroll) {
        const win = window,
            docEl = win.document.documentElement

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
        let tout
        if (scrollY !== win.scrollY) {
            tout = scrollTimeout || 10
        } else if (tries < 30) {
            // try to scroll a few times more in case elements are lazy loaded
            tries++
            tout = 50
        }
        if(tout) {
            setTimeout(() => {
                checkScroll(el, options, tries)
            }, tout)
        }
    }
}

export const scrollByHash = (url, options) => {
    if (url.indexOf('#') >= 0 && url.length > 1) {
        addScrollEvent()

        DomUtil.waitForElement('#' + decodeURI(url.split('#')[1])).then((el) => {
            // check until postion is reached
            checkScroll(el, Object.assign({}, _app_.scrollOptions, Util.removeNullValues(options, {removeUndefined: true})), 0)
        }).catch(() => {})
    }
}
