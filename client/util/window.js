/* open a new window centered */

export const openWindow = ({url, target})=>{
    const w = screen.width / 3 * 2, h = screen.height / 3 * 2,
        left = (screen.width / 2) - (w / 2),
        top = (screen.height / 2) - (h / 2)

    return window.open(url, target || '_blank',
        'toolbar=no, location=no, directories=no, status=no, menubar=no, scrollbars=yes, resizable=yes, copyhistory=no, width=' + w + ', height=' + h + ', top=' + top + ', left=' + left)

}

/* open a url in a new tab and focus it - window.open returns null when a popup blocker
   (or an embedded browser) refuses the new window, so don't call focus() on null */
export const openTab = (url) => {
    const win = window.open(url, '_blank')
    if (win) {
        win.focus()
    }
    return win
}
