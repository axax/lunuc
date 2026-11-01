/*
 MUI positions a popover / menu only once when it opens. If its size changes afterwards (lazy
 loaded icons, web fonts, expanded sub items) it can end up partially outside the viewport.
 This observes the paper and repositions whenever its size changes.
 Used by SimpleMenu and SimpleSelect.

 getAction: returns the MUI popover action ({updatePosition})
 */
export const createPaperObserver = (getAction) => {
    let resizeObserver = null

    const disconnect = () => {
        if (resizeObserver) {
            resizeObserver.disconnect()
            resizeObserver = null
        }
    }

    const observe = (element) => {
        disconnect()
        if (element && typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(() => {
                getAction()?.updatePosition()
            })
            resizeObserver.observe(element)
        }
    }

    return {observe, disconnect}
}
