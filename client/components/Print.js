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

// Element tags that may not contain a plain <div> as a child
const TABLE_SECTION_TAGS = ['TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR']

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
                'Print.almostDone': 'Bitte warten... Das PDF ist gleich fertiggestellt!',
                'Print.createPage': 'Bitte warten... Es kann ein wenig dauern... Seite %page% von %numberOfPages% ist erstellt.',
                'Print.failed': 'Das PDF konnte nicht erstellt werden.'
            },
            en: {
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

        if (!simulation) {
            await this.waitForScripts()
        }

        const printHeader = headerSelector ? this.$(headerSelector, printArea)[0] : null,
            printFooter = footerSelector ? this.$(footerSelector, printArea)[0] : null

        // Reset any leftovers from a previous run before measuring
        this.cleanup(printArea, printAreaInner, printFooter)

        await this.waitForLayout(printArea)

        const metrics = this.measure({printArea, printAreaInner, printHeader, printFooter})

        this.calculatePageBreaks({printAreaInner, metrics})

        if (simulation) {
            return true
        }

        overlay.style.display = 'flex'
        printArea.classList.add(classes.isPrinting)
        printArea.classList.add('print-area-printing')

        let watermarkImage = null
        if (this.props.watermark) {
            watermarkImage = await this.loadImage(this.props.watermark)
        }

        try {
            const breaks = Array.from(this.$('.' + classes.pageBreak, printAreaInner))

            // All repeated elements are inserted BEFORE rendering and positioned
            // absolutely, so the layout no longer shifts while pages are captured.
            const pageTops = this.insertRepeatedElements({
                printArea, printAreaInner, printHeader, printFooter, breaks, metrics
            })

            await this.waitForLayout(printArea)

            const pdfContent = await this.renderPages({
                printArea, printAreaInner, overlay, metrics, pageTops, watermarkImage
            })

            overlay.innerText = _t('Print.almostDone')

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
            this.cleanup(printArea, printAreaInner, printFooter, !this.props.showPageBreak)
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

    cleanup(printArea, printAreaInner, printFooter, removeBreaks) {
        this.$('[data-is-print-clone="true"]', printAreaInner).forEach(n => {
            if (n.parentNode) {
                n.parentNode.removeChild(n)
            }
        })
        this.$('.' + this.props.classes.pageBreak, printAreaInner).forEach(n => {
            n.style.height = ''
        })
        if (printFooter) {
            printFooter.style.visibility = ''
        }
        if (removeBreaks) {
            this.removeExistingPageBreaks(printAreaInner)
        }
    }

    /* ------------------------------------------------------------------ *
     * measuring
     * ------------------------------------------------------------------ */

    measure({printArea, printAreaInner, printHeader, printFooter}) {
        return {
            // everything is measured relative to the top of the print area
            contentTop: this.offsetTop(printArea),
            paddingTop: this.getPropertyAsNumber(printArea, 'padding-top')
                + this.getPropertyAsNumber(printAreaInner, 'padding-top'),
            paddingBottom: this.getPropertyAsNumber(printArea, 'padding-bottom')
                + this.getPropertyAsNumber(printAreaInner, 'padding-bottom'),
            headerHeight: printHeader
                ? this.outerHeight(printHeader)
                : 0,
            footerHeight: printFooter
                ? this.outerHeight(printFooter)
                : 0
        }
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

    /* ------------------------------------------------------------------ *
     * page break calculation
     * ------------------------------------------------------------------ */

    calculatePageBreaks({printAreaInner, metrics}) {
        const {forceManuelBreak, manualBreakSelector} = this.props

        this.removeExistingPageBreaks(printAreaInner)

        const totalHeight = printAreaInner.clientHeight
            + metrics.headerHeight // reserved on continuation pages
            + metrics.footerHeight

        if (totalHeight < this.availableHeight(metrics, 0) && !(forceManuelBreak && manualBreakSelector)) {
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

        if (!(forceManuelBreak && manualBreakSelector)) {
            this.applyKeepWithNext(printAreaInner, metrics)
        }
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

    setBreakRec(node, ctx) {
        const {forceManuelBreak, noBreakClassName, breakTolerance} = this.props
        const {metrics} = ctx
        // Never let content silently overflow. The old default of 20px was cut off
        // by the white rectangle drawn on the canvas.
        const tolerance = breakTolerance === undefined ? 0 : breakTolerance

        // Snapshot the node list: inserting breaks mutates a live NodeList and
        // makes forEach visit the same node twice.
        const nodes = Array.from(ctx.manualBreakSelector
            ? node.querySelectorAll(ctx.manualBreakSelector)
            : node.childNodes)

        for (const childNode of nodes) {
            if (childNode.nodeType !== Node.ELEMENT_NODE) {
                continue
            }
            if (childNode.classList.contains(this.props.classes.pageBreak)) {
                continue
            }

            if (forceManuelBreak && ctx.manualBreakSelector) {
                this.insertBreakBefore(childNode, ctx)
                continue
            }

            const nodeTop = this.offsetTop(childNode),
                nodeBottom = nodeTop + this.outerHeight(childNode),
                pageBottom = ctx.lastBreakBottom + this.availableHeight(metrics, ctx.pageIndex),
                overflow = nodeBottom - pageBottom

            if (overflow <= tolerance) {
                continue
            }

            if (this.isNoBreak(childNode, noBreakClassName)) {
                continue
            }

            // The element does not fit. If it starts on this page and has block
            // children of its own, descend and break inside it.
            const startsOnThisPage = nodeTop < pageBottom
            if (startsOnThisPage && !ctx.manualBreakSelector && this.hasOnlyElementChildren(childNode)) {
                this.setBreakRec(childNode, ctx)
                continue
            }

            this.insertBreakBefore(childNode, ctx)
        }

        // a manual selector pass that produced nothing still needs automatic breaks
        if (ctx.manualBreakSelector && !forceManuelBreak && nodes.length === 0) {
            this.setBreakRec(node, {...ctx, manualBreakSelector: null})
        }

        return ctx.lastBreakBottom
    }

    isNoBreak(element, noBreakClassName) {
        if (!noBreakClassName) {
            return false
        }
        return noBreakClassName.some(cn => element.classList.contains(cn))
    }

    // Only descend into elements whose direct children are all elements. Otherwise
    // inline text between the children would be skipped and could get clipped.
    hasOnlyElementChildren(element) {
        if (!element.children || element.children.length === 0) {
            return false
        }
        return Array.from(element.childNodes).every(n =>
            n.nodeType === Node.ELEMENT_NODE ||
            (n.nodeType === Node.TEXT_NODE && !n.textContent.trim())
        )
    }

    /* ------------------------------------------------------------------ *
     * break insertion
     * ------------------------------------------------------------------ */

    insertBreakBefore(childNode, ctx) {
        const {metrics} = ctx
        const br = this.createBreakElement(childNode, ctx)
        if (!br) {
            return false
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
            const pageTop = index === 0
                ? metrics.contentTop + metrics.paddingTop
                : this.offsetTop(breaks[index - 1]) + this.outerHeight(breaks[index - 1])

            let moved = 0
            while (moved < 3) {
                const prev = br.previousElementSibling
                if (!prev || prev.classList.contains(classes.pageBreak) || !prev.matches(selector)) {
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

    insertRepeatedElements({printArea, printAreaInner, printHeader, printFooter, breaks, metrics}) {
        const innerPageHeight = this.innerPageHeight(metrics)

        // Top edge of each page's content box, relative to the print area top.
        const pageTops = [0]
        breaks.forEach(br => {
            pageTops.push(this.offsetTop(br) - metrics.contentTop)
        })

        if (printHeader && metrics.headerHeight) {
            for (let page = 1; page < pageTops.length; page++) {
                const clone = printHeader.cloneNode(true)
                clone.dataset.isPrintClone = 'true'
                clone.style.position = 'absolute'
                clone.style.left = '0'
                clone.style.right = '0'
                clone.style.margin = '0'
                // relative to printAreaInner, which starts one paddingTop lower
                clone.style.top = `${pageTops[page] - metrics.paddingTop}px`
                printAreaInner.appendChild(clone)
            }
        }

        if (printFooter && metrics.footerHeight) {
            for (let page = 0; page < pageTops.length; page++) {
                const clone = printFooter.cloneNode(true)
                clone.dataset.isPrintClone = 'true'
                clone.style.position = 'absolute'
                clone.style.left = '0'
                clone.style.right = '0'
                clone.style.margin = '0'
                clone.style.visibility = 'visible'
                clone.style.top = `${pageTops[page] + innerPageHeight - metrics.footerHeight - metrics.paddingTop}px`
                printAreaInner.appendChild(clone)
            }
            // keep the original in the flow (it was accounted for) but hide it
            printFooter.style.visibility = 'hidden'
        }

        // Make sure the last page is fully covered so absolutely positioned
        // footers are not clipped by overflow:hidden.
        const requiredHeight = pageTops[pageTops.length - 1] + innerPageHeight - metrics.paddingTop
        const missing = requiredHeight - printAreaInner.offsetHeight
        if (missing > 0) {
            const spacer = document.createElement('div')
            spacer.dataset.isPrintClone = 'true'
            spacer.style.height = `${missing}px`
            printAreaInner.appendChild(spacer)
        }

        return pageTops
    }

    /* ------------------------------------------------------------------ *
     * rendering
     * ------------------------------------------------------------------ */

    async renderPages({printArea, printAreaInner, overlay, metrics, pageTops, watermarkImage}) {
        const {showDate} = this.props
        const scale = this.props.scale || 2
        const pageCount = pageTops.length
        const innerPageHeight = this.innerPageHeight(metrics)
        const pdfContent = []

        const scrollYOffset = this.isInFixedContainer(printArea) ? 0 : window.scrollY

        for (let page = 0; page < pageCount; page++) {
            overlay.innerText = _t('Print.createPage', {page: page + 1, numberOfPages: pageCount})

            const isFirstPage = page === 0,
                isLastPage = page === pageCount - 1

            // The page top must end up at paddingTop within the captured image.
            // On page 0 the padding is already part of the print area.
            const captureTop = isFirstPage ? 0 : pageTops[page] - metrics.paddingTop
            const scrollY = -captureTop - scrollYOffset

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

            if (!isLastPage) {
                // content of this page ends where the next page starts
                const contentBottom = Math.min(
                    pageTops[page + 1] - pageTops[page] + (isFirstPage ? 0 : metrics.paddingTop),
                    footerTop
                )
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
            // which only added blur and file size.
            const data = out.toDataURL(this.props.imageType || 'image/png', this.props.imageQuality || 0.95)

            pdfContent.push({
                image: data,
                width: PDF_IMAGE_WIDTH,
                pageBreak: isLastPage ? '' : 'after'
            })
        }

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
    forceManuelBreak: PropTypes.bool,
    noBreakClassName: PropTypes.array,
    watermark: PropTypes.string,
    watermarkOption: PropTypes.object,
    scale: PropTypes.number,
    onCustomEvent: PropTypes.func,
    // new options
    breakTolerance: PropTypes.number,       // px of overflow accepted before breaking (default 0)
    keepWithNextSelector: PropTypes.string, // elements that must not end a page, '' disables
    minTableRemainder: PropTypes.number,    // px of a table required on a page (default 60)
    imageType: PropTypes.string,            // 'image/png' (default) or 'image/jpeg'
    imageQuality: PropTypes.number
}

export default injectSheet(styles)(Print)