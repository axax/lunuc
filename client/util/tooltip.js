/* quick and dirty tooltip that is added to the body */
let tooltipTimeout
export const showTooltip = (msg, opt) => {

    let tooltip = document.querySelector('[data-tooltip="true"]')
    if (!tooltip) {
        tooltip = document.createElement('div')
        tooltip.dataset.tooltip = true
        tooltip.style.cssText += 'font-size:0.7rem;border-radius:0.3rem;color:#fff;background:rgba(0, 0, 0,0.6);z-index:99999;position:fixed;padding:0.05rem 0.4rem;visibility:hidden;opacity:0;transition: visibility 0.3s linear,opacity 0.3s linear'

        document.body.appendChild(tooltip)
    }

    if(opt.target){

        const rect = opt.target.getBoundingClientRect()
        opt.left = rect.left
        opt.top = rect.top - 20
    }

    tooltip.style.visibility = 'visible'
    tooltip.style.opacity = 1
    tooltip.style.left = opt.left + 'px'
    tooltip.style.top = opt.top + 'px'
    tooltip.innerText = msg
    if (opt.closeIn) {
        clearTimeout(tooltipTimeout)
        tooltipTimeout = setTimeout(() => {
            tooltip.style.visibility = 'hidden'
            tooltip.style.opacity = 0
            tooltipTimeout = setTimeout(() => {
                if (tooltip && tooltip.parentNode) {
                    tooltip.parentNode.removeChild(tooltip)
                }
            }, 300)
        }, opt.closeIn)
    }
}
export const hideTooltip = () => {
    let tooltip = document.querySelector('[data-tooltip="true"]')
    if(tooltip){
        tooltip.style.visibility = 'hidden'
        tooltip.style.opacity = 0
    }
}