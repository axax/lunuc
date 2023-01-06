import DomUtil from '../../../client/util/dom.mjs'

export const scrollByHash = (url, {scrollStep, scrollOffset, scrollTimeout}) => {
    if (url.indexOf('#') >= 0 && url.length>1) {
         const checkScroll = (el) => {
            if (el) {
                const win = window,
                    scrollY = win.scrollY,
                    docEl = win.document.documentElement
                let mt = parseInt(win.getComputedStyle(el).marginTop)

                if(isNaN(mt)){
                    mt = 0
                }

                let y = Math.floor(el.getBoundingClientRect().top + win.pageYOffset + (scrollOffset || -mt))
                if (y > docEl.scrollHeight - win.innerHeight) {
                    y = docEl.scrollHeight - win.innerHeight
                }

                let step = Math.abs(y - scrollY)
                if ( step > 2) {
                    if(!scrollStep){
                        scrollStep = Math.ceil(step / 20)
                    }
                    if (step > scrollStep) {
                        step = scrollStep
                    }
                    let newY = scrollY
                    if(y > scrollY){
                        newY += step
                    }else{
                        newY -=step
                    }
                    win.scrollTo(0, newY)
                    if (scrollY !== win.scrollY) {
                        setTimeout(() => {
                            checkScroll(el)
                        }, scrollTimeout || 10)
                    }
                }
            }
        }
        DomUtil.waitForElement('#' + url.split('#')[1]).then((el) => {
            // check until postion is reached
            checkScroll(el)
        }).catch(()=>{})
    }
}
