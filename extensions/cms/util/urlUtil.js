import DomUtil from '../../../client/util/dom.mjs'
import Util from '../../../client/util/index.mjs'



let manualScroll
const manualScrollEvent = ()=>{
    manualScroll = true
}
const addScrollEvent = ()=>{
    if(manualScroll===undefined) {
        const ael = window.addEventListener
        ael('wheel', manualScrollEvent, {passive: true})
        ael('DOMMouseScroll', manualScrollEvent, {passive: true})
        ael('touchmove', manualScrollEvent, {passive: true})
    }
    manualScroll = false
}

const scrollToElement = (el, options, tries = 0, winHash) => {
    if (!el || manualScroll || (winHash && winHash !== window.location.hash)) {
        return
    }

    const win = window
    const docEl = win.document.documentElement

    let {scrollOffset, scrollEase} = options
    if (el.dataset.scrollOffset) {
        scrollOffset = parseInt(el.dataset.scrollOffset)
    }
    // fraction of the remaining distance moved per frame (ease-out feel)
    if (!scrollEase) {
        scrollEase = 0.2
    }

    let mt = parseInt(win.getComputedStyle(el).marginTop)
    if (isNaN(mt)) {
        mt = 0
    }

    const scrollY = win.scrollY
    const maxY = docEl.scrollHeight - win.innerHeight

    // round the target to a full pixel ONCE to avoid sub-pixel chasing
    let y = Math.round(el.getBoundingClientRect().top + scrollY + (scrollOffset || -mt))
    if (y > maxY) y = maxY
    if (y < 0) y = 0

    const diff = y - scrollY

    // dead-zone: stop when close enough. this kills the 1px back-and-forth
    // that shows up as jitter on iOS / retina displays
    if (Math.abs(diff) <= 1) {
        if (tries < 20) {
            // element might still move due to lazy loaded content above it,
            // so keep watching a few frames without actually scrolling
            tries++
            requestAnimationFrame(() => scrollToElement(el, options, tries, winHash))
        }
        return
    }

    let step = diff * scrollEase
    // always move at least 1px towards the target so we don't stall
    if (Math.abs(step) < 1) {
        step = diff > 0 ? 1 : -1
    }

    win.scrollTo(0, scrollY + step)

    // still moving -> reset the lazy-load try budget
    requestAnimationFrame(() => scrollToElement(el, options, 0, winHash))
}

// expose to global Util
Util.scrollToElement = scrollToElement

export const scrollByHash = (url, options) => {
    if (url.indexOf('#') >= 0 && url.length > 1) {
        addScrollEvent()

        DomUtil.waitForElement('#' + decodeURI(url.split('#')[1])).then((el) => {
            // check until postion is reached
            scrollToElement(el, Object.assign({}, _app_.scrollOptions, Util.removeNullValues(options, {removeUndefined: true})), 0, window.location.hash)
        }).catch(() => {})
    }
}
