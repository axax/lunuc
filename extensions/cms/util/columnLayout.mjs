/**
 * Column widths of layout elements (12 column grid, classes col-{bp}-{n} per breakpoint, mobile first).
 * Shared by the column editor in the element dialog and the resize handles on the page.
 */

export const GRID = 12

// smallest first - a breakpoint without own value inherits from the next smaller one
export const COL_BREAKPOINTS = [
    {short: 'xs', long: 'Mobile'},
    {short: 'sm', long: 'Tablet'},
    {short: 'md', long: 'Desktop'},
    {short: 'lg', long: 'Large Desktop'}
]

const COL_REGEX = /col-(xs|sm|md|lg)-(\d+)/

/** ' col-sm-4 ' -> 4, empty / unknown -> null (= inherits from the next smaller breakpoint) */
export const parseSpan = (raw) => {
    if (!raw || !raw.match) return null
    const m = raw.match(COL_REGEX)
    return m ? parseInt(m[2]) : null
}

/** spans per breakpoint after inheritance: a column without own value takes the one of the next smaller breakpoint */
export const effectiveSpans = (spans, breakpoints = COL_BREAKPOINTS) => {
    const result = {}
    let prev = null
    breakpoints.forEach(bp => {
        prev = spans[bp.short].map((s, i) => s !== null ? s : (prev ? prev[i] : GRID))
        result[bp.short] = prev
    })
    return result
}

export const hasOwnSpans = (spans, bp) => spans[bp].some(s => s !== null)

export const sameSpans = (a, b) => a.length === b.length && a.every((s, i) => s === b[i])

/**
 * New spans for one breakpoint -> list of {bp, index, value} to write.
 * Bigger breakpoints that were identical to this one so far follow the change (they are cleared, so they inherit).
 */
export const spanChanges = (spans, bp, newSpans, breakpoints = COL_BREAKPOINTS) => {
    const effective = effectiveSpans(spans, breakpoints)
    const bpIndex = breakpoints.findIndex(b => b.short === bp)
    const old = effective[bp]
    const changes = newSpans.map((s, index) => ({bp, index, value: ` col-${bp}-${s} `}))
    for (let k = bpIndex + 1; k < breakpoints.length; k++) {
        const big = breakpoints[k].short
        if (!hasOwnSpans(spans, big)) continue
        if (!sameSpans(effective[big], old)) break
        spans[big].forEach((s, index) => changes.push({bp: big, index, value: ' '}))
    }
    return changes
}

let mediaCache = null

/**
 * Breakpoint that is active in the given window: the biggest one whose col-{bp}-* rules (from the page css)
 * are inside a matching media query. Falls back to xs.
 */
export const detectBreakpoint = (win = typeof window !== 'undefined' ? window : null, breakpoints = COL_BREAKPOINTS) => {
    if (!win || !win.document) return breakpoints[0].short
    const sheets = win.document.styleSheets
    if (!mediaCache || mediaCache.win !== win || mediaCache.count !== sheets.length) {
        const media = {}
        const walk = (rules, condition) => {
            for (const rule of rules) {
                if (rule.media && rule.cssRules) {
                    walk(rule.cssRules, rule.media.mediaText)
                } else if (rule.selectorText) {
                    if (condition) {
                        const m = rule.selectorText.match(COL_REGEX)
                        if (m && !media[m[1]]) media[m[1]] = condition
                    }
                    if (rule.cssRules && rule.cssRules.length) walk(rule.cssRules, condition)
                }
            }
        }
        for (const sheet of sheets) {
            try {
                walk(sheet.cssRules || [], null)
            } catch (e) {
                // cross origin stylesheet
            }
        }
        mediaCache = {win, count: sheets.length, media}
    }
    let active = breakpoints[0].short
    breakpoints.forEach(bp => {
        const condition = mediaCache.media[bp.short]
        if (condition && win.matchMedia(condition).matches) active = bp.short
    })
    return active
}
