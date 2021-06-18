import DomUtil from '../../../client/util/dom'

export const scrollByHash = (url, {scrollStep, scrollOffset, scrollTimeout}) => {
    if (url.indexOf('#') >= 0) {
        const checkScroll = (el, c) => {
            if (el) {
                let w = window, de = w.document.documentElement, mt = parseInt(w.getComputedStyle(el).marginTop)

                if(isNaN(mt)){
                    mt = 0
                }

                let y = Math.floor(el.getBoundingClientRect().top + w.pageYOffset + (scrollOffset || -mt))
                if (y > de.scrollHeight - w.innerHeight) {
                    y = de.scrollHeight - w.innerHeight
                }

                if ( Math.abs(w.scrollY - y) > 2 || c < 3) {
                    let step = y - w.scrollY
                    if (step > (scrollStep || 50)) {
                        step = scrollStep || 50
                    }
                    w.scrollTo(0, w.scrollY + step)
                    if (c < 5000) {
                        setTimeout(() => {
                            checkScroll(el, c + 1)
                        }, scrollTimeout || 10)
                    }
                }
            }
        }
        DomUtil.waitForElement('#' + url.split('#')[1]).then((el) => {
            // check until postion is reached
            checkScroll(el, 0)
        })
    }
}
