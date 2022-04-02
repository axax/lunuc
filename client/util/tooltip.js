/* quick and dirty tooltip that is added to the body */
let tooltipTimeout
export const showTooltip = (msg, opt) => {

    let tooltip = document.querySelector('[data-tooltip="true"]')
    if (!tooltip) {
        tooltip = document.createElement('div')
        tooltip.dataset.tooltip = true
        tooltip.style.cssText += 'background: rgba(245, 245, 66,0.4);z-index:9999;position:fixed;padding:1rem;visibility:hidden;opacity:0;transition: visibility 0.3s linear,opacity 0.3s linear'


        document.body.appendChild(tooltip)

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
