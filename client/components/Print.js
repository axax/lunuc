import React from 'react'
import PropTypes from 'prop-types'
import DomUtil from 'client/util/dom.mjs'
import Util from 'client/util/index.mjs'
import injectSheet from 'react-jss'
import {_t, registerTrs} from '../../util/i18n.mjs'
import classNames from 'classnames'

// A4 aspect ratio (297mm / 210mm). PAGE_HEIGHT must follow PAGE_WIDTH exactly,
// otherwise the rasterized page does not fit the pdf page and pdfmake inserts blanks.
const A4_RATIO = 297 / 210
const PAGE_WIDTH = 1020
const PAGE_HEIGHT = Math.round(PAGE_WIDTH * A4_RATIO) // 1443

// A4 is 595.28pt wide / 841.89pt high. With zero page margins the image may be at
// most 841.89 / A4_RATIO = 595.13pt wide, so 595 keeps us just below the limit.
const PDF_IMAGE_WIDTH = 595

// Default elements that must not be the last thing on a page
const DEFAULT_KEEP_WITH_NEXT = 'h1,h2,h3,h4,h5,h6,.keep-with-next'

const SCRIPT_TIMEOUT = 30000

const styles = {
    button: {
        height: '30px',
        backgroundColor: '#46b8da',
        cursor: 'pointer',
        margin: 'auto',
        display: 'block',
        border: 'none',
        color: '#fff',
        fontWeight: 'bold',
        marginBottom: '20px',
        '&:hover': {
            backgroundColor: '#31b0d5'
        }
    },
    root: {
        backgroundColor: '#525659',
        padding: '3.5em 0',
        minWidth: `calc(${PAGE_WIDTH}px + 7rem)`
    },
    wrapper: {
        margin: 'auto',
        display: 'block',
        width: PAGE_WIDTH + 'px',
        border: 'solid 1px #E5E5E5',
        boxShadow: '0 4px 8px 0 rgba(0,0,0,0.12),0 2px 4px 0 rgba(0,0,0,0.08)'
    },
    printArea: {
        backgroundColor: '#fff',
        fontFamily: '\'Roboto\', sans-serif',
        padding: '2rem',
        height: '100%',
        width: '100%',
        overflow: 'hidden'
    },
    printAreaInner: {
        position: 'relative',
        '& img': {
            maxWidth: '100%'
        }
    },
    overlay: {
        position: 'fixed',
        padding: '50px 50px',
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        zIndex: 99999999,
        fontSize: '2.5rem',
        color: '#fff',
        display: 'none',
        lineHeight: 1.6
    },
    pageBreak: {
        width: '100%',
        boxSizing: 'border-box',
        borderTop: 'dashed 1px #ffd633',
        position: 'relative',
        top: '-2px',
        '&:after': {
            position: 'absolute',
            right: '10px',
            display: 'block',
            content: '"Seitenumbruch"',
            color: '#000',
            fontSize: '0.7em',
            background: '#ffd633',
            padding: '3px'
        }
    },
    isPrinting: {
        '& $pageBreak': {
            borderTop: 'none',
            '&:after': {
                display: 'none'
            }
        }
    }
}

class Print extends React.PureComponent {

    constructor(props) {
        super(props)

        registerTrs({
            de: {
                'Print.prepare': 'Bitte warten... Das PDF wird vorbereitet.',
                'Print.loadResources': 'Bitte warten... Bilder und Schriften werden geladen.',
                'Print.calculateBreaks': 'Bitte warten... Die Seitenumbrüche werden berechnet.',
                'Print.prepareLayout': 'Bitte warten... Kopf- und Fusszeilen werden platziert.',
                'Print.almostDone': 'Bitte warten... Das PDF ist gleich fertiggestellt!',
                'Print.createPage': 'Bitte warten... Es kann ein wenig dauern... Seite %page% von %numberOfPages% ist erstellt.',
                'Print.failed': 'Das PDF konnte nicht erstellt werden.'
            },
            en: {
                'Print.prepare': 'Please wait... Preparing the pdf.',
                'Print.loadResources': 'Please wait... Loading images and fonts.',
                'Print.calculateBreaks': 'Please wait... Calculating the page breaks.',
                'Print.prepareLayout': 'Please wait... Placing headers and footers.',
                'Print.almostDone': 'Please be patient... We are almost there... Enjoy!',
                'Print.createPage': 'Please be patient... It might take some time... Page %page% of %numberOfPages% is being produced',
                'Print.failed': 'The PDF could not be created.'
            }
        }, 'Print')

        DomUtil.addScript('/pdfmake.min.js', {id: 'pdfmake'})
        DomUtil.addScript('/html2canvas.min.js', {id: 'html2canvas'})

        this.busy = false
        this.simulationScheduled = false
        this.unmounted = false
    }

    componentDidMount() {
        if (this.props.onCustomEvent) {
            this.props.onCustomEvent(this)
        }
        if (this.props.createOnMount) {
            this.createPdf()
        } else if (this.props.showPageBreak) {
            this.scheduleSimulation()
        }
    }

    componentDidUpdate() {
        if (this.props.showPageBreak) {
            this.scheduleSimulation()
        }
    }

    componentWillUnmount() {
        this.unmounted = true
    }

    // Coalesce repeated updates into a single break simulation per frame
    scheduleSimulation() {
        if (this.simulationScheduled || this.busy) {
            return
        }
        this.simulationScheduled = true
        requestAnimationFrame(() => {
            this.simulationScheduled = false
            if (!this.unmounted) {
                this.createPdf(true)
            }
        })
    }

    render() {
        const {classes, children, style, printAreaInnerStyle, buttonLabel, className, showButtons} = this.props

        return <div className={classNames(classes.root, className)}>
            {showButtons !== false && <button className={classes.button}
                                              id="printPdfButton"
                                              onClick={() => {
                                                  this.createPdf()
                                              }}>{buttonLabel || 'Create PDF'}</button>}
            <div className={classes.overlay}></div>
            <div className={classes.wrapper}>
                <div className={classNames(classes.printArea, 'print-area')} style={style}>
                    <div className={classNames(classes.printAreaInner, 'print-area-inner')}
                         style={printAreaInnerStyle}>{children}</div>
                </div>
            </div>
        </div>
    }

    $ = (expr, p) => (p || document).querySelectorAll(expr)

    /* ------------------------------------------------------------------ *
     * waiting helpers - replaces the old fixed setTimeout guesswork
     * ------------------------------------------------------------------ */

    async waitForScripts() {
        const deadline = Date.now() + SCRIPT_TIMEOUT
        while (!window.html2canvas || !window.pdfMake) {
            if (Date.now() > deadline) {
                throw new Error('Print: pdfmake / html2canvas could not be loaded')
            }
            await new Promise(resolve => setTimeout(resolve, 100))
        }
    }

    // Measuring a layout that is still settling is the main source of bad breaks.
    async waitForLayout(root) {
        if (document.fonts && document.fonts.ready) {
            try {
                await document.fonts.ready
            } catch (e) {
                // font loading api not available or rejected - continue anyway
            }
        }

        const images = Array.from(root.querySelectorAll('img'))
        await Promise.all(images.map(img => {
            if (img.complete && img.naturalWidth > 0) {
                return null
            }
            return new Promise(resolve => {
                const done = () => {
                    img.removeEventListener('load', done)
                    img.removeEventListener('error', done)
                    resolve()
                }
                img.addEventListener('load', done)
                img.addEventListener('error', done)
                // never block forever on a broken image
                setTimeout(done, 20000)
            })
        }))

        // two frames: one for style recalc, one for the resulting layout
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    }

    /* ------------------------------------------------------------------ *
     * main entry point
     * ------------------------------------------------------------------ */

    createPdf(simulation) {
        if (this.busy) {
            return Promise.resolve(false)
        }
        this.busy = true
        return this.runCreatePdf(simulation)
            .catch(e => {
                console.error('Print: pdf creation failed', e)
                const overlay = this.$(`.${this.props.classes.overlay}`)[0]
                if (overlay) {
                    overlay.innerText = _t('Print.failed')
                    setTimeout(() => {
                        overlay.style.display = 'none'
                    }, 3000)
                }
                return false
            })
            .finally(() => {
                this.busy = false
            })
    }

    async runCreatePdf(simulation) {
        const {classes, pdfName, headerSelector, footerSelector} = this.props

        const overlay = this.$(`.${classes.overlay}`)[0],
            printArea = this.$(`.${classes.printArea}`)[0],
            printAreaInner = this.$(`.${classes.printAreaInner}`, printArea)[0]

        if (!printArea || !printAreaInner) {
            return false
        }

        // A simulation runs on every editor keystroke, so it must never flash the
        // overlay and must not pay for the frames a status message costs.
        const status = simulation || !overlay
            ? async () => {}
            : async (key, params) => {
                overlay.innerText = _t(key, params)
                // The browser paints only when the main thread is idle. Page break
                // calculation and html2canvas both block it synchronously, so
                // without yielding here the message would never become visible.
                await new Promise(resolve =>
                    requestAnimationFrame(() => requestAnimationFrame(resolve)))
            }

        if (!simulation) {
            overlay.style.display = 'flex'
            await status('Print.prepare')
            await this.waitForScripts()
        }

        // A template that repeats a product may contain more than one header and
        // footer. Every single one of them has to be handled, not just the first.
        const printHeaders = headerSelector ? Array.from(this.$(headerSelector, printArea)) : []
        const printFooters = footerSelector ? Array.from(this.$(footerSelector, printArea)) : []

        // Reset any leftovers from a previous run before measuring
        this.cleanup(printArea, printAreaInner, printFooters)

        await status('Print.loadResources')
        await this.waitForLayout(printArea)

        const metrics = this.measure({printArea, printAreaInner, printHeaders, printFooters})

        await status('Print.calculateBreaks')
        this.calculatePageBreaks({
            printAreaInner,
            metrics,
            ignoreRoots: printHeaders.concat(printFooters)
        })

        if (simulation) {
            return true
        }

        printArea.classList.add(classes.isPrinting)
        printArea.classList.add('print-area-printing')

        let watermarkImage = null
        if (this.props.watermark) {
            watermarkImage = await this.loadImage(this.props.watermark)
        }

        try {
            const breaks = Array.from(this.$('.' + classes.pageBreak, printAreaInner))

            await status('Print.prepareLayout')

            // All repeated elements are inserted BEFORE rendering and positioned
            // absolutely, so the layout no longer shifts while pages are captured.
            const pageTops = this.insertRepeatedElements({
                printArea, printAreaInner, printHeaders, printFooters, breaks, metrics
            })

            await this.waitForLayout(printArea)

            const pdfContent = await this.renderPages({
                printArea, printAreaInner, status, metrics, pageTops, watermarkImage
            })

            await status('Print.almostDone')

            const docDefinition = {
                version: '1.5',
                pages: pageTops.length,
                info: {
                    title: pdfName,
                    author: 'lunuc.com'
                },
                pageMargins: [0, 0, 0, 0],
                pageSize: 'A4',
                content: pdfContent
            }

            window.pdfMake.fonts = {
                Roboto: {
                    normal: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf'
                }
            }

            if (this.props.openPdf) {
                if (this.props.closeWindow) {
                    window.close()
                }
                window.pdfMake.createPdf(docDefinition).open()
                overlay.style.display = 'none'
            } else {
                await new Promise(resolve => {
                    window.pdfMake.createPdf(docDefinition).download((pdfName || 'file') + '.pdf', () => {
                        overlay.style.display = 'none'
                        resolve()
                    })
                })
            }
            return true
        } finally {
            printArea.classList.remove(classes.isPrinting)
            printArea.classList.remove('print-area-printing')
            this.cleanup(printArea, printAreaInner, printFooters, !this.props.showPageBreak)
        }
    }

    loadImage(src) {
        return new Promise(resolve => {
            const img = new Image()
            img.onload = () => resolve(img)
            img.onerror = () => resolve(null)
            img.src = src
        })
    }

    cleanup(printArea, printAreaInner, printFooters, removeBreaks) {
        this.$('[data-is-print-clone="true"]', printAreaInner).forEach(n => {
            if (n.parentNode) {
                n.parentNode.removeChild(n)
            }
        })
        this.$('.' + this.props.classes.pageBreak, printAreaInner).forEach(n => {
            n.style.height = ''
        })
        // every footer was hidden, so every footer has to be restored
        ;(printFooters || []).forEach(footer => {
            footer.style.visibility = ''
        })
        if (removeBreaks) {
            this.removeExistingPageBreaks(printAreaInner)
        }
    }

    /* ------------------------------------------------------------------ *
     * measuring
     * ------------------------------------------------------------------ */

    measure({printArea, printAreaInner, printHeaders, printFooters}) {
        return {
            // everything is measured relative to the top of the print area
            contentTop: this.offsetTop(printArea),
            paddingTop: this.getPropertyAsNumber(printArea, 'padding-top')
                + this.getPropertyAsNumber(printAreaInner, 'padding-top'),
            paddingBottom: this.getPropertyAsNumber(printArea, 'padding-bottom')
                + this.getPropertyAsNumber(printAreaInner, 'padding-bottom'),
            // the tallest one wins - reserving too little space is what causes
            // content to run into the footer
            headerHeight: this.maxRepeatedHeight(printHeaders),
            footerHeight: this.maxRepeatedHeight(printFooters)
        }
    }

    maxRepeatedHeight(elements) {
        if (!elements || elements.length === 0) {
            return 0
        }
        return elements.reduce((max, el) => Math.max(max, this.repeatedElementHeight(el)), 0)
    }

    // offsetHeight ignores child margins that collapse out of the element. A footer
    // that only has a border-top therefore measures shorter than the space it
    // really occupies, and the content above it overlaps the footer in the pdf.
    repeatedElementHeight(element) {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) {
            return 0
        }
        const rect = element.getBoundingClientRect()
        const style = window.getComputedStyle(element)
        let top = rect.top - (parseInt(style.marginTop) || 0)
        let bottom = rect.bottom + (parseInt(style.marginBottom) || 0)

        element.querySelectorAll('*').forEach(child => {
            const childRect = child.getBoundingClientRect()
            if (!childRect.height && !childRect.width) {
                return
            }
            const childStyle = window.getComputedStyle(child)
            if (childStyle.position === 'absolute' || childStyle.position === 'fixed') {
                return
            }
            top = Math.min(top, childRect.top - (parseInt(childStyle.marginTop) || 0))
            bottom = Math.max(bottom, childRect.bottom + (parseInt(childStyle.marginBottom) || 0))
        })

        return Math.ceil(bottom - top)
    }

    // Usable content height of a page. The first page carries no repeated header.
    availableHeight(metrics, pageIndex) {
        return PAGE_HEIGHT
            - metrics.paddingTop
            - metrics.paddingBottom
            - metrics.footerHeight
            - (pageIndex > 0 ? metrics.headerHeight : 0)
    }

    // Full content box of a page including the space taken by header and footer
    innerPageHeight(metrics) {
        return PAGE_HEIGHT - metrics.paddingTop - metrics.paddingBottom
    }

    /**
     * Distance between the top of the print area and the top of the captured page.
     * pageTops[0] is 0 because the padding of page one is already part of the
     * captured area, while every other entry is a real dom position. Positioning
     * and capturing must use the exact same value, otherwise page one ends up
     * offset by paddingTop against all other pages.
     */
    captureTop(metrics, pageTops, page) {
        return page === 0 ? 0 : pageTops[page] - metrics.paddingTop
    }

    /* ------------------------------------------------------------------ *
     * page break calculation
     * ------------------------------------------------------------------ */

    calculatePageBreaks({printAreaInner, metrics, ignoreRoots}) {
        const {manualBreakSelector} = this.props

        this.removeExistingPageBreaks(printAreaInner)

        const hasManualMarkers = manualBreakSelector
            ? this.$(manualBreakSelector, printAreaInner).length > 0
            : false

        const totalHeight = printAreaInner.clientHeight
            + metrics.headerHeight // reserved on continuation pages
            + metrics.footerHeight

        if (totalHeight < this.availableHeight(metrics, 0) && !hasManualMarkers) {
            return
        }

        const ctx = {
            metrics,
            manualBreakSelector,
            pageIndex: 0,
            // bottom edge of the last inserted break = top of the current page content
            lastBreakBottom: metrics.contentTop + metrics.paddingTop,
            rootNode: printAreaInner
        }

        this.setBreakRec(printAreaInner, ctx)

        // Manual markers used to disable this. Headings still must not dangle at
        // the bottom of a page, so it now always runs; manual breaks are skipped.
        this.applyKeepWithNext(printAreaInner, metrics)

        this.removeEmptyPages({printAreaInner, ignoreRoots})
    }

    /**
     * A break can end up in front of a segment that carries no visible content at
     * all - the classic case is the footer sitting in the flow at the end of the
     * template: it no longer fits, so a break goes in front of it and the resulting
     * page shows nothing but the repeated header and footer. Those breaks are
     * dropped again here.
     *
     * ignoreRoots holds the header and footer originals. They are content in the
     * dom but they are reproduced as clones on every page, so they must not keep a
     * segment alive.
     */
    removeEmptyPages({printAreaInner, ignoreRoots}) {
        if (this.props.keepEmptyPages) {
            return
        }
        let removedTotal = 0

        // Removing a break shifts everything below it, so measure again per round.
        // Empty segments are short, which is why this settles almost immediately.
        for (let round = 0; round < 3; round++) {
            const breaks = Array.from(this.$('.' + this.props.classes.pageBreak, printAreaInner))
            if (!breaks.length) {
                break
            }

            const ink = this.collectInk(printAreaInner, ignoreRoots)
            const contentEnd = this.offsetTop(printAreaInner) + printAreaInner.offsetHeight
            const removable = []

            breaks.forEach((br, i) => {
                const from = this.offsetTop(br) + this.outerHeight(br)
                const to = i + 1 < breaks.length ? this.offsetTop(breaks[i + 1]) : contentEnd
                const filled = ink.some(box => box.bottom > from + 1 && box.top < to - 1)
                if (!filled) {
                    removable.push(br)
                }
            })

            if (!removable.length) {
                break
            }

            removable.forEach(br => {
                // a break inside a table lives in its own <tr>
                const node = br.tagName === 'TD' && br.parentNode && br.parentNode.tagName === 'TR'
                    ? br.parentNode
                    : br
                if (node.parentNode) {
                    node.parentNode.removeChild(node)
                }
            })
            removedTotal += removable.length
        }

        if (removedTotal) {
            console.info(`Print: dropped ${removedTotal} empty page(s)`)
        }
    }

    // Vertical extent of everything that actually leaves a mark on the paper.
    collectInk(printAreaInner, ignoreRoots) {
        const breakClass = this.props.classes.pageBreak
        const roots = ignoreRoots || []
        const boxes = []

        printAreaInner.querySelectorAll('*').forEach(element => {
            if (element.classList.contains(breakClass)) {
                return
            }
            if (element.dataset && element.dataset.isPrintClone === 'true') {
                return
            }
            if (roots.some(root => root === element || root.contains(element))) {
                return
            }
            if (!this.hasInk(element)) {
                return
            }
            const rect = element.getBoundingClientRect()
            if (!rect.height && !rect.width) {
                return
            }
            const top = rect.top + document.documentElement.scrollTop
            boxes.push({top, bottom: top + rect.height})
        })

        return boxes
    }

    hasInk(element) {
        // cheap checks first, getComputedStyle is the expensive part here
        for (const child of element.childNodes) {
            if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
                return true
            }
        }
        const tag = (element.tagName || '').toUpperCase()
        if (tag === 'IMG' || tag === 'SVG' || tag === 'CANVAS' || tag === 'VIDEO' || tag === 'IFRAME') {
            return true
        }

        const style = window.getComputedStyle(element)
        if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) {
            return false
        }
        if (style.backgroundImage && style.backgroundImage !== 'none') {
            return true
        }
        const background = style.backgroundColor
        if (background
            && background !== 'transparent'
            && !/rgba\([^)]*,\s*0(\.0+)?\s*\)/.test(background)) {
            return true
        }
        return ['Top', 'Right', 'Bottom', 'Left'].some(side =>
            (parseFloat(style[`border${side}Width`]) || 0) > 0
            && style[`border${side}Style`] !== 'none'
        )
    }

    removeExistingPageBreaks(printAreaInner) {
        this.$('.' + this.props.classes.pageBreak, printAreaInner).forEach(n => {
            // a break inside a table is wrapped in its own <tr>
            const node = n.tagName === 'TD' && n.parentNode.tagName === 'TR' ? n.parentNode : n
            if (node.parentNode) {
                node.parentNode.removeChild(node)
            }
        })
    }

    /**
     * Single pass over the tree. A manual marker always forces a break, and a
     * segment that does not fit on the current page gets an additional automatic
     * break. The old implementation returned early for manual markers, so content
     * between two markers could exceed the page height without anyone noticing -
     * that overflow is what overlapped the footer.
     */
    setBreakRec(node, ctx) {
        const {noBreakClassName, breakTolerance} = this.props
        const {metrics} = ctx
        // Never let content silently overflow. The old default of 20px was cut off
        // by the white rectangle drawn on the canvas.
        const tolerance = breakTolerance === undefined ? 0 : breakTolerance

        // Snapshot the node list: inserting breaks mutates a live NodeList and
        // makes forEach visit the same node twice.
        const nodes = Array.from(node.childNodes)

        for (const childNode of nodes) {
            if (childNode.nodeType !== Node.ELEMENT_NODE) {
                continue
            }
            if (childNode.classList.contains(this.props.classes.pageBreak)) {
                continue
            }

            // an explicit marker in the template always starts a new page
            if (ctx.manualBreakSelector && this.safeMatches(childNode, ctx.manualBreakSelector)) {
                this.insertBreakBefore(childNode, ctx, true)
                continue
            }

            const nodeTop = this.offsetTop(childNode),
                nodeBottom = nodeTop + this.outerHeight(childNode),
                pageBottom = ctx.lastBreakBottom + this.availableHeight(metrics, ctx.pageIndex),
                overflow = nodeBottom - pageBottom

            if (overflow <= tolerance) {
                // The element fits, but a marker may sit somewhere inside it.
                if (ctx.manualBreakSelector
                    && childNode.querySelector
                    && childNode.querySelector(ctx.manualBreakSelector)) {
                    this.setBreakRec(childNode, ctx)
                }
                continue
            }

            if (this.isNoBreak(childNode, noBreakClassName)) {
                continue
            }

            // The element does not fit. If it starts on this page and has block
            // children of its own, descend and break inside it. A nested manual
            // marker is reason enough to descend even when the child mix is odd -
            // otherwise the break lands before the whole item and the overflow stays.
            const hasNestedMarker = ctx.manualBreakSelector
                && childNode.querySelector
                && !!childNode.querySelector(ctx.manualBreakSelector)

            const startsOnThisPage = nodeTop < pageBottom
            if (startsOnThisPage && (hasNestedMarker || this.hasOnlyElementChildren(childNode))) {
                this.setBreakRec(childNode, ctx)
                continue
            }

            this.insertBreakBefore(childNode, ctx)
        }

        return ctx.lastBreakBottom
    }

    // A selector coming from a cms template may be invalid, which must not kill
    // the whole pdf run.
    safeMatches(element, selector) {
        if (!element.matches) {
            return false
        }
        try {
            return element.matches(selector)
        } catch (e) {
            return false
        }
    }

    // Accepts both 'pageFooter' and '.pageFooter'. classList.contains never
    // matched a leading dot, so a configured no-break class silently did nothing.
    isNoBreak(element, noBreakClassName) {
        if (!noBreakClassName || !noBreakClassName.length) {
            return false
        }
        return noBreakClassName.some(cn => {
            if (!cn) {
                return false
            }
            if (cn.charAt(0) === '.' || cn.charAt(0) === '#' || cn.indexOf('[') >= 0) {
                return this.safeMatches(element, cn)
            }
            return element.classList.contains(cn)
        })
    }

    // Only descend into elements whose direct children are all elements. Otherwise
    // inline text between the children would be skipped and could get clipped.
    hasOnlyElementChildren(element) {
        if (!element.children || element.children.length === 0) {
            return false
        }
        return Array.from(element.childNodes).every(n =>
            n.nodeType === Node.ELEMENT_NODE ||
            n.nodeType === Node.COMMENT_NODE ||
            (n.nodeType === Node.TEXT_NODE && !n.textContent.trim())
        )
    }

    /* ------------------------------------------------------------------ *
     * break insertion
     * ------------------------------------------------------------------ */

    insertBreakBefore(childNode, ctx, isManual) {
        const {metrics} = ctx
        const br = this.createBreakElement(childNode, ctx)
        if (!br) {
            return false
        }

        if (isManual) {
            br.dataset.manualBreak = 'true'
        }

        // Reserve the space the repeated header will occupy on the new page.
        // Doing it here (instead of during rendering) keeps every subsequent
        // measurement correct.
        if (metrics.headerHeight) {
            br.style.height = `${metrics.headerHeight}px`
        }

        ctx.pageIndex++
        ctx.lastBreakBottom = this.offsetTop(br) + this.outerHeight(br)
        return true
    }

    createBreakElement(childNode, ctx) {
        const parent = childNode.parentNode
        if (!parent) {
            return null
        }
        const parentTag = parent.tagName

        // A plain <div> between table rows is invalid and gets moved out of the
        // table by the browser, which destroys the layout.
        if (parentTag === 'TR') {
            return this.createPageBreakRow(parent, ctx)
        }
        if (parentTag === 'THEAD' || parentTag === 'TBODY' || parentTag === 'TFOOT') {
            return this.createPageBreakRow(childNode, ctx)
        }
        if (parentTag === 'TABLE') {
            // break before the whole table rather than inside its section
            return this.createPageBreakDiv(parent)
        }
        return this.createPageBreakDiv(childNode)
    }

    createPageBreakRow(rowNode, ctx) {
        // If only a small part of the table would remain on the current page,
        // move the whole table to the next page instead.
        const table = this.getParentByTagName(rowNode, 'TABLE')
        if (table && ctx) {
            const minTableRemainder = this.props.minTableRemainder === undefined
                ? 60
                : this.props.minTableRemainder
            if (this.offsetTop(rowNode) - this.offsetTop(table) < minTableRemainder) {
                return this.createPageBreakDiv(table)
            }
        }

        const tr = document.createElement('tr'),
            td = document.createElement('td')
        td.className = this.props.classes.pageBreak
        td.colSpan = 99
        td.style.border = 'none'
        td.style.padding = '0'
        tr.appendChild(td)
        if (!rowNode.parentNode) {
            return null
        }
        rowNode.parentNode.insertBefore(tr, rowNode)
        return td
    }

    createPageBreakDiv(childNode) {
        if (!childNode.parentNode) {
            return null
        }
        const br = document.createElement('div')
        br.className = this.props.classes.pageBreak
        childNode.parentNode.insertBefore(br, childNode)
        return br
    }

    /* ------------------------------------------------------------------ *
     * widow / orphan handling
     * ------------------------------------------------------------------ */

    // Move a break up if it would leave a heading alone at the bottom of a page.
    applyKeepWithNext(printAreaInner, metrics) {
        const {classes, keepWithNextSelector} = this.props
        const selector = keepWithNextSelector === undefined ? DEFAULT_KEEP_WITH_NEXT : keepWithNextSelector
        if (!selector) {
            return
        }

        const minPageFill = this.availableHeight(metrics, 1) * 0.2
        const breaks = Array.from(this.$('.' + classes.pageBreak, printAreaInner))

        breaks.forEach((br, index) => {
            if (br.tagName === 'TD') {
                return // headings inside tables are out of scope
            }
            if (br.dataset.manualBreak === 'true') {
                return // an explicit break in the template stays where it is
            }
            const pageTop = index === 0
                ? metrics.contentTop + metrics.paddingTop
                : this.offsetTop(breaks[index - 1]) + this.outerHeight(breaks[index - 1])

            let moved = 0
            while (moved < 3) {
                const prev = br.previousElementSibling
                if (!prev || prev.classList.contains(classes.pageBreak) || !this.safeMatches(prev, selector)) {
                    break
                }
                // do not move if it would leave the page nearly empty
                if (this.offsetTop(prev) - pageTop < minPageFill) {
                    break
                }
                br.parentNode.insertBefore(br, prev)
                moved++
            }
        })
    }

    /* ------------------------------------------------------------------ *
     * repeated header / footer
     * ------------------------------------------------------------------ */

    insertRepeatedElements({printArea, printAreaInner, printHeaders, printFooters, breaks, metrics}) {
        const innerPageHeight = this.innerPageHeight(metrics)

        // Top edge of each page's content box, relative to the print area top.
        const pageTops = [0]
        breaks.forEach(br => {
            pageTops.push(this.offsetTop(br) - metrics.contentTop)
        })

        // Cache positions before any clone is appended so the lookup below stays
        // stable even if the browser reflows.
        const headerPositions = printHeaders.map(el => this.offsetTop(el))
        const footerPositions = printFooters.map(el => this.offsetTop(el))

        for (let page = 0; page < pageTops.length; page++) {
            const pageTopAbs = metrics.contentTop + pageTops[page] + (page === 0 ? metrics.paddingTop : 0)
            const captureTop = this.captureTop(metrics, pageTops, page)

            if (page > 0 && printHeaders.length && metrics.headerHeight) {
                // the header of the item this page belongs to, not always the first one
                const source = this.pickRepeated(printHeaders, headerPositions, pageTopAbs, 'before')
                const clone = this.createRepeatedClone(source, page)
                clone.style.top = `${captureTop}px`
                printAreaInner.appendChild(clone)
            }

            if (printFooters.length && metrics.footerHeight) {
                const source = this.pickRepeated(printFooters, footerPositions, pageTopAbs, 'after')
                const clone = this.createRepeatedClone(source, page)
                clone.style.top = `${captureTop + innerPageHeight - metrics.footerHeight}px`
                printAreaInner.appendChild(clone)
            }
        }

        // Keep the originals in the flow (their height was accounted for) but hide
        // all of them. Previously only the first footer was hidden, so in a
        // repeated template every other footer stayed visible mid-page.
        if (metrics.footerHeight) {
            printFooters.forEach(footer => {
                footer.style.visibility = 'hidden'
            })
        }

        // Make sure the last page is fully covered so absolutely positioned
        // footers are not clipped by overflow:hidden. Must match the position the
        // footer clone actually got, hence captureTop instead of pageTops.
        const lastPage = pageTops.length - 1
        const requiredHeight = this.captureTop(metrics, pageTops, lastPage) + innerPageHeight
        const missing = requiredHeight - printAreaInner.offsetHeight
        if (missing > 0) {
            const spacer = document.createElement('div')
            spacer.dataset.isPrintClone = 'true'
            spacer.style.height = `${missing}px`
            printAreaInner.appendChild(spacer)
        }

        return pageTops
    }

    // 'before' picks the last element that starts at or above the page top
    // (headers), 'after' the first one at or below it (footers).
    pickRepeated(elements, positions, pageTopAbs, mode) {
        if (elements.length === 1) {
            return elements[0]
        }
        if (mode === 'before') {
            let found = elements[0]
            for (let i = 0; i < elements.length; i++) {
                if (positions[i] <= pageTopAbs + 1) {
                    found = elements[i]
                }
            }
            return found
        }
        for (let i = 0; i < elements.length; i++) {
            if (positions[i] >= pageTopAbs - 1) {
                return elements[i]
            }
        }
        return elements[elements.length - 1]
    }

    /**
     * A page is almost never as tall in the dom as it is on paper: pageTops grow by
     * the real distance between two breaks, while the footer is placed a full
     * innerPageHeight below the page top. The clones of the following pages
     * therefore reach into the capture area of the current page - which is exactly
     * how a header of page n+1 ends up sitting on the footer of page n. Only the
     * clones belonging to the page being captured may be visible.
     */
    setRepeatedClonesForPage(printAreaInner, page) {
        this.$('[data-print-clone-page]', printAreaInner).forEach(clone => {
            clone.style.display = clone.dataset.printClonePage === String(page) ? '' : 'none'
        })
    }

    createRepeatedClone(source, page) {
        const clone = source.cloneNode(true)
        clone.dataset.isPrintClone = 'true'
        clone.dataset.printClonePage = String(page)

        // duplicated ids break every script that looks the element up by id
        clone.removeAttribute('id')
        clone.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'))

        // cloneNode copies the canvas element but not its bitmap, so a qr code
        // rendered into a canvas would come out empty
        const sourceCanvases = source.querySelectorAll('canvas')
        if (sourceCanvases.length) {
            const cloneCanvases = clone.querySelectorAll('canvas')
            sourceCanvases.forEach((sourceCanvas, i) => {
                const targetCanvas = cloneCanvases[i]
                if (targetCanvas && sourceCanvas.width && sourceCanvas.height) {
                    targetCanvas.width = sourceCanvas.width
                    targetCanvas.height = sourceCanvas.height
                    try {
                        targetCanvas.getContext('2d').drawImage(sourceCanvas, 0, 0)
                    } catch (e) {
                        // tainted canvas - nothing we can do here
                    }
                }
            })
        }

        clone.style.position = 'absolute'
        clone.style.left = '0'
        clone.style.right = '0'
        clone.style.margin = '0'
        clone.style.visibility = 'visible'
        // opaque and on top, so leftover content can never bleed through
        clone.style.zIndex = '10'
        clone.style.backgroundColor = this.props.repeatedElementBackground === undefined
            ? '#ffffff'
            : this.props.repeatedElementBackground
        return clone
    }

    /* ------------------------------------------------------------------ *
     * rendering
     * ------------------------------------------------------------------ */

    /**
     * A page is embedded as one raster image. Beyond roughly six megapixel the
     * macOS pdf viewers drop the decoded bitmap while scrolling and render a blank
     * page instead, so an over-ambitious scale is capped here. Six megapixel still
     * means about 250 dpi at 595pt page width, which is more than enough for print.
     */
    effectiveScale() {
        const requested = this.props.scale || 2
        const budget = this.props.maxPagePixels === undefined ? 6000000 : this.props.maxPagePixels
        if (!budget) {
            return requested
        }
        const pagePixels = PAGE_WIDTH * PAGE_HEIGHT
        if (pagePixels * requested * requested <= budget) {
            return requested
        }
        const limited = Math.max(1, Math.floor(Math.sqrt(budget / pagePixels) * 100) / 100)
        console.warn(
            `Print: scale ${requested} would produce `
            + `${Math.round(pagePixels * requested * requested / 1e6)} megapixel per page, `
            + `reduced to ${limited}. Raise maxPagePixels to opt out.`
        )
        return limited
    }

    async renderPages({printArea, printAreaInner, status, metrics, pageTops, watermarkImage}) {
        const {showDate} = this.props
        const scale = this.effectiveScale()
        const pageCount = pageTops.length
        const innerPageHeight = this.innerPageHeight(metrics)
        const pdfContent = []

        for (let page = 0; page < pageCount; page++) {
            const isFirstPage = page === 0,
                isLastPage = page === pageCount - 1

            // Read the scroll position per page: the overlay does not lock scrolling,
            // so a user scrolling mid-run would otherwise shift every later page.
            const scrollYOffset = this.isInFixedContainer(printArea) ? 0 : window.scrollY

            // The page top must end up at paddingTop within the captured image.
            // On page 0 the padding is already part of the print area.
            const captureTop = this.captureTop(metrics, pageTops, page)
            const scrollY = -captureTop - scrollYOffset

            // hide the header/footer clones of every other page before capturing.
            // The status update below yields two frames, which also gets the style
            // change applied before html2canvas reads the dom.
            this.setRepeatedClonesForPage(printAreaInner, page)
            await status('Print.createPage', {page: page + 1, numberOfPages: pageCount})

            const canvas = await window.html2canvas(printArea, {
                imageTimeout: 20000,
                width: PAGE_WIDTH - 1,
                height: PAGE_HEIGHT,
                scale,
                scrollX: -window.scrollX - 7,
                scrollY,
                backgroundColor: '#ffffff'
            })

            const out = document.createElement('canvas')
            out.width = canvas.width
            out.height = canvas.height
            const ctx = out.getContext('2d')
            ctx.fillStyle = 'white'
            ctx.fillRect(0, 0, out.width, out.height)
            ctx.drawImage(canvas, 0, 0)

            // Mask everything that belongs to the previous or the next page.
            if (!isFirstPage) {
                ctx.fillRect(0, 0, out.width, metrics.paddingTop * scale)
            }

            const footerTop = metrics.footerHeight
                ? metrics.paddingTop + innerPageHeight - metrics.footerHeight
                : PAGE_HEIGHT
            const footerBottom = metrics.footerHeight
                ? metrics.paddingTop + innerPageHeight
                : PAGE_HEIGHT

            // Always clear the gap between the end of this page's content and the
            // footer - including on the last page, which was skipped before. If a
            // segment still overflows, it now gets cut instead of overlapping.
            const contentBottom = isLastPage
                ? footerTop
                : Math.min(
                    pageTops[page + 1] - pageTops[page] + (isFirstPage ? 0 : metrics.paddingTop),
                    footerTop
                )
            if (contentBottom < footerTop) {
                ctx.fillRect(0, contentBottom * scale, out.width, (footerTop - contentBottom) * scale)
            }
            if (metrics.footerHeight) {
                ctx.fillRect(0, footerBottom * scale, out.width, (PAGE_HEIGHT - footerBottom) * scale)
            }

            if (watermarkImage) {
                this.drawWatermark(ctx, out, watermarkImage, scale)
            }

            ctx.textBaseline = 'top'
            ctx.font = `${10 * scale}px sans-serif`
            ctx.fillStyle = 'rgba(0,0,0,0.5)'
            ctx.fillText(
                (page + 1) + ' / ' + pageCount + (showDate ? ' - ' + Util.formatDate(new Date()) : ''),
                10 * scale,
                out.height - 20 * scale
            )

            // No upscaling here: the old code stretched 1020x1443 to 1530x2165,
            // which only added blur and file size. jpeg is safe because the canvas
            // was filled with opaque white before drawing.
            const data = out.toDataURL(
                this.props.imageType || 'image/png',
                this.props.imageQuality === undefined ? 0.95 : this.props.imageQuality
            )

            pdfContent.push({
                image: data,
                width: PDF_IMAGE_WIDTH,
                pageBreak: isLastPage ? '' : 'after'
            })
        }

        const imageType = this.props.imageType || 'image/png'
        const bytes = pdfContent.reduce((sum, p) => sum + Math.round(p.image.length * 0.75), 0)
        console.info(
            `Print: ${pageCount} page(s), ${imageType}, scale ${scale}, `
            + `~${(bytes / 1048576).toFixed(1)} MB of image data. `
            + `Use imageType 'image/jpeg' if a viewer struggles with this document.`
        )

        return pdfContent
    }

    drawWatermark(context, canvas, watermarkImage, scale) {
        const wmOptions = this.props.watermarkOption
        const w = watermarkImage.width * scale,
            h = watermarkImage.height * scale
        let y = canvas.height - h,
            x = canvas.width - w

        if (wmOptions) {
            if (wmOptions.left === 'center') {
                x = (canvas.width - w) / 2
            }
            if (wmOptions.bottom) {
                y -= wmOptions.bottom * scale
            }
        }
        context.drawImage(watermarkImage, x, y, w, h)
    }

    /* ------------------------------------------------------------------ *
     * dom helpers
     * ------------------------------------------------------------------ */

    getPropertyAsNumber(element, propName) {
        if (!element || !propName) {
            return 0
        }
        if (propName.constructor === Array) {
            return propName.reduce((a, p) => a + this.getPropertyAsNumber(element, p), 0)
        }
        const propValue = parseInt(window.getComputedStyle(element, null).getPropertyValue(propName))
        return isNaN(propValue) ? 0 : propValue
    }

    getParentByTagName(el, tagName) {
        while (el && el.tagName !== tagName) {
            el = el.parentElement
        }
        return el
    }

    offsetTop(e) {
        if (!e || e.nodeType === Node.TEXT_NODE) {
            return document.documentElement.scrollTop
        }
        return e.getBoundingClientRect().top + document.documentElement.scrollTop
    }

    outerHeight(element) {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) {
            return 0
        }
        const style = window.getComputedStyle(element)
        return ['top', 'bottom']
            .map(side => parseInt(style[`margin-${side}`]) || 0)
            .reduce((total, side) => total + side, element.offsetHeight)
    }

    isInFixedContainer(element) {
        let currentElement = element
        while (currentElement && currentElement !== document.body) {
            if (window.getComputedStyle(currentElement).position === 'fixed') {
                return true
            }
            currentElement = currentElement.parentElement
        }
        return false
    }
}

Print.propTypes = {
    children: PropTypes.any,
    style: PropTypes.object,
    printAreaInnerStyle: PropTypes.object,
    className: PropTypes.string,
    classes: PropTypes.object.isRequired,
    buttonLabel: PropTypes.string,
    showButtons: PropTypes.bool,
    createOnMount: PropTypes.bool,
    showPageBreak: PropTypes.bool,
    openPdf: PropTypes.bool,
    closeWindow: PropTypes.bool,
    showDate: PropTypes.bool,
    pdfName: PropTypes.string,
    headerSelector: PropTypes.string,
    footerSelector: PropTypes.string,
    manualBreakSelector: PropTypes.string,
    // deprecated: manual markers always force a break, automatic breaks are
    // always added on top of them. Kept so existing templates do not crash.
    forceManuelBreak: PropTypes.bool,
    noBreakClassName: PropTypes.array,
    watermark: PropTypes.string,
    watermarkOption: PropTypes.object,
    scale: PropTypes.number,
    onCustomEvent: PropTypes.func,
    breakTolerance: PropTypes.number,       // px of overflow accepted before breaking (default 0)
    keepWithNextSelector: PropTypes.string, // elements that must not end a page, '' disables
    minTableRemainder: PropTypes.number,    // px of a table required on a page (default 60)
    keepEmptyPages: PropTypes.bool,         // true keeps pages without visible content
    imageType: PropTypes.string,            // 'image/png' (default) or 'image/jpeg'
    imageQuality: PropTypes.number,
    maxPagePixels: PropTypes.number,        // pixel budget per page, 0 disables the cap
    repeatedElementBackground: PropTypes.string // background of header/footer clones
}

export default injectSheet(styles)(Print)