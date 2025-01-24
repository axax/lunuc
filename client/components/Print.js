import React from 'react'
import PropTypes from 'prop-types'
import DomUtil from 'client/util/dom.mjs'
import Util from 'client/util/index.mjs'
import injectSheet from 'react-jss'
import {_t, registerTrs} from '../../util/i18n.mjs'
import classNames from 'classnames'

const PAGE_HEIGHT = 1430, PAGE_WIDTH = 1010

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
            backgroundColor: '#31b0d5',

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
        position:'relative',
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
                "Print.almostDone": "Bitte warten... Das PDF ist gleich fertiggestellt!",
                "Print.createPage": "Bitte warten... Es kann ein wenig dauern... Seite %page% von %numberOfPages% ist erstellt.",
            },
            en: {
                "Print.almostDone": "Please be patient... We are almost there... Enjoy!",
                "Print.createPage": "Please be patient... It might take some time... Page %page% of %numberOfPages% is being produced"
            }
        }, 'Print')

        DomUtil.addScript('/pdfmake.min.js', {id: 'pdfmake'})
        DomUtil.addScript('/html2canvas.min.js', {id: 'html2canvas'})
    }

    componentDidUpdate() {
        if (this.props.showPageBreak) {
            this.createPdf(true)
        }
    }

    componentDidMount() {
        if (this.props.onCustomEvent) {
            this.props.onCustomEvent(this)
        }
        if (this.props.createOnMount) {
            setTimeout(() => {
                this.createPdfWait()
            }, 300)
        } else {

            if (this.props.showPageBreak) {
                setTimeout(() => {
                    this.createPdf(true)
                }, 500)
            }
        }


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

    createPdfWait() {
        if (!this.createPdf()) {
            setTimeout(() => {
                this.createPdfWait()
            }, 300)
        }
    }


    $ = (expr, p) => (p || document).querySelectorAll(expr)

    createPdf(simulation) {
        if (!simulation && !window.html2canvas) return false
        if (!simulation && !window.pdfMake) return false
        const {classes, pdfName, showDate, headerSelector, footerSelector} = this.props
        const overlay = this.$(`.${classes.overlay}`)[0],
            printArea = this.$(`.${classes.printArea}`)[0],
            printAreaInner = this.$(`.${classes.printAreaInner}`, printArea)[0],
            printHeader = headerSelector ? this.$(headerSelector, printArea)[0]:null,
            printFooter = footerSelector ? this.$(footerSelector, printArea)[0]:null,
            pdfContent = [],
            scale = this.props.scale || 1

        let watermarkImage
        if (!simulation) {
            overlay.style.display = 'flex'
            printArea.classList.add(classes.isPrinting)
            printArea.classList.add('print-area-printing')
            if (this.props.watermark) {
                watermarkImage = new Image()
                watermarkImage.src = this.props.watermark
            }
        }


        const offsetTop = this.offsetTop(printArea),
            pagePaddingTop = this.getPropertyAsNumber(printArea, 'padding-top') + this.getPropertyAsNumber(printAreaInner, 'padding-top'),
            pagePaddingBottom = this.getPropertyAsNumber(printArea, 'padding-bottom') + this.getPropertyAsNumber(printAreaInner, 'padding-bottom'),
            pageHeaderHeight = this.getPropertyAsNumber(printHeader, ['height','margin-top','margin-bottom']),
            pageFooterHeight = this.getPropertyAsNumber(printFooter, ['height','margin-top','margin-bottom'])

        setTimeout(() => {

            this.calculatePageBreaks({
                printAreaInner,
                paddingTop: pagePaddingTop,
                paddingBottom: pagePaddingBottom,
                offsetTop
            })
            const breaks = this.$('.' + classes.pageBreak, printAreaInner)

            const nextPage = page => {
                overlay.innerText = _t('Print.createPage', {page: page + 1, numberOfPages: breaks.length + 1})

                const isLastPage = breaks.length === page,
                    isFirstPage = page === 0

                let posCurrentBreak = 0, posPreviousBreak = 0

                if (!isLastPage) {
                    posCurrentBreak = this.offsetTop(breaks[page]) - offsetTop + this.outerHeight(breaks[page])
                }
                if (!isFirstPage) {
                    posPreviousBreak = this.offsetTop(breaks[page - 1]) - offsetTop + this.outerHeight(breaks[page - 1])
                }
                const scrollYOffset = this.isInFixedContainer(printArea) ? 0 : window.scrollY
                const scrollY = (page > 0 ? -(posPreviousBreak - pagePaddingTop + scrollYOffset) : -scrollYOffset)

                if(printHeader && page > 0){
                    const printHeaderClone = printHeader.cloneNode(true)
                    printHeaderClone.dataset.isPrintClone = true
                    printHeaderClone.style.position = 'absolute'
                    printHeaderClone.style.left = 0
                    printHeaderClone.style.right = 0
                    printHeaderClone.style.top = `${posPreviousBreak - pagePaddingTop}px`
                    printAreaInner.appendChild(printHeaderClone)
                    breaks[page - 1].style.height = `${pageHeaderHeight}px`
                }

                if(printFooter){

                    const printFooterClone = printFooter.cloneNode(true)
                    printFooterClone.dataset.isPrintClone = true
                    printFooterClone.style.visibility='visible'
                    let contentHeight

                    if(!isLastPage) {
                        contentHeight = PAGE_HEIGHT - (posCurrentBreak - posPreviousBreak) - (page * (pagePaddingTop+pageHeaderHeight))
                        posCurrentBreak += contentHeight + pageFooterHeight
                        breaks[page].parentNode.insertBefore(printFooterClone, breaks[page])
                    }else{
                        contentHeight = PAGE_HEIGHT - (this.outerHeight(printAreaInner) -  posPreviousBreak) - pageFooterHeight
                        printAreaInner.appendChild(printFooterClone)
                        printFooter.style.visibility='hidden'
                    }
                    printFooterClone.style.marginTop = `${contentHeight - pageFooterHeight}px`
                }


                html2canvas(printArea, {
                    dpi: 300,
                    imageTimeout: 20000,
                    width: PAGE_WIDTH - 1,
                    height: PAGE_HEIGHT,
                    scale,
                    scrollX: -window.scrollX - 7,
                    scrollY: scrollY,
                    /*logging: true,*/
                    /*proxy: ( (ENV=="development" )?"linkedin/src/php/html2canvasproxy.php":"php/html2canvasproxy.php"),*/
                }).then(canvas => {


                    const createCanvas = document.createElement('canvas')
                    createCanvas.height = canvas.height
                    createCanvas.width = canvas.width
                    const context = createCanvas.getContext('2d')
                    context.clearRect(0, 0, canvas.width, canvas.height)


                    context.drawImage(canvas, 0, 0)

                    // Cover top and bottom area with a white rect
                    context.fillStyle = 'white'
                    if (!isFirstPage) {
                        context.fillRect(0, 0, canvas.width, pagePaddingTop * scale)
                    }
                    if (!isLastPage) {
                        let h = posCurrentBreak - posPreviousBreak
                        context.fillRect(0, ((page > 0 ? pagePaddingTop : 0) + h) * scale, canvas.width, canvas.height - h * scale)
                    }


                    if (watermarkImage) {
                        const wmOptions = this.props.watermarkOption


                        let w = watermarkImage.width * scale,
                            h = watermarkImage.height * scale,
                            y = canvas.height - h


                        let x
                        if (wmOptions) {
                            if (wmOptions.left === 'center') {
                                x = (canvas.width - w) / 2
                            }
                            if (wmOptions.bottom) {
                                y -= wmOptions.bottom * scale
                            }
                        }

                        if (!x) {
                            x = canvas.width - w
                        }


                        context.drawImage(watermarkImage, x, y, w, h)
                    }

                    // draw page number
                    context.textBaseline = "top"
                    context.font = `${10 * scale}px sans-serif`
                    context.fillStyle = "rgba(0,0,0,0.5)"
                    context.fillText((page + 1) + ' / ' + (breaks.length + 1) + (showDate ? ' - ' + Util.formatDate(new Date()) : ''), 10 * scale, canvas.height - 20 * scale)


                    const data = createCanvas.toDataURL()
                    /*
                                        const img = document.createElement('img')
                                        img.src = data

                                        document.body.appendChild(img)
                                        console.log(data)*/
                    pdfContent.push({
                        image: data,
                        width: 595
                    })

                    if (page < breaks.length) {
                        nextPage(page + 1)
                    } else {

                        printArea.classList.remove(classes.isPrinting)
                        printArea.classList.remove('print-area-printing')
                        // $pai.css({marginTop:0})
                        //$pa.css({overflow:"visible",height:"auto"})

                        // window.open(data);

                        const docDefinition = {
                            pageMargins: [0, 0, 0, 0],
                            pageSize: 'A4',

                            content: pdfContent
                        }
                        overlay.innerText = _t('Print.almostDone')

                        /* if( toprint ){
                         window.pdfMake.createPdf(docDefinition).getDataUrl((dataUrl) => {

                         var iFrame = document.createElement('iframe');
                         iFrame.style.position = 'absolute';
                         iFrame.style.left = '-99999px';
                         iFrame.src = dataUrl;
                         iFrame.onload = function() {
                         function removeIFrame(){
                         document.body.removeChild(iFrame);
                         document.removeEventListener('click', removeIFrame);
                         }
                         document.addEventListener('click', removeIFrame, false);
                         };

                         document.body.appendChild(iFrame);

                         $(".cv-overlay").hide()

                         },{ autoPrint: true } )
                         }else{*/
                        if (this.props.openPdf) {
                            if (this.props.closeWindow) {
                                window.close()
                            }
                            pdfMake.createPdf(docDefinition).open()
                            overlay.style.display = 'none'
                        } else {
                            pdfMake.createPdf(docDefinition).download((pdfName || 'file') + '.pdf', () => {
                                overlay.style.display = 'none'
                            })
                        }
                        if (!this.props.showPageBreak) {
                            this.removeExistingPageBreaks(printAreaInner)
                        }

                        this.$('[data-is-print-clone="true"]', printAreaInner).forEach(n => {
                            n.parentNode.removeChild(n)
                        })
                        if(printFooter){
                            printFooter.style.visibility='visible'
                        }
                    }
                })


            }

            if (!simulation) {
                nextPage(0)
            }

            /* const doc = new jsPDF()

             doc.text('Hello world!', 10, 10)
             doc.save('a4.pdf')*/
        }, 1000) // little delay for images

        return true
    }


    getPropertyAsNumber(element, propName) {
        if(!element || !propName){
            return 0
        }
        if(propName.constructor===Array){
            return propName.reduce((a,p)=>a+this.getPropertyAsNumber(element,p),0)
        }
        const propValue = parseInt(window.getComputedStyle(element, null).getPropertyValue(propName))
        if(isNaN(propValue)){
            return 0
        }
        return propValue
    }

    calculatePageBreaks({printAreaInner, paddingTop, paddingBottom, offsetTop}) {
        const {forceManuelBreak, manualBreakSelector} = this.props

        this.removeExistingPageBreaks(printAreaInner)

        // check if there is a break needed
        if (printAreaInner.clientHeight < (PAGE_HEIGHT - paddingTop - paddingBottom) && !(forceManuelBreak && manualBreakSelector)) {
            return
        }

        console.log('calculatePageBreaks')
        this.setBreakRec(printAreaInner, {offsetTop, PAGE_HEIGHT, paddingBottom, paddingTop})

    }

    removeExistingPageBreaks(printAreaInner) {
        const {classes} = this.props

        //remove existing breaks
        this.$('.' + classes.pageBreak, printAreaInner).forEach(n => {
            n.parentNode.removeChild(n)
        })

    }

    setBreakRec(node, {offsetTop, paddingBottom, paddingTop, rootNode}) {
        const {forceManuelBreak, manualBreakSelector, noBreakClassName} = this.props
        const innerPageHeight = PAGE_HEIGHT - paddingTop - paddingBottom

        let nodes = node.childNodes
        if (manualBreakSelector) {
            nodes = node.querySelectorAll(manualBreakSelector)
        }

        nodes.forEach(childNode => {

            if(childNode.nodeType === Node.TEXT_NODE){
                return
            }

            const newOffsetTop = this.offsetTop(childNode),
                pos = newOffsetTop - offsetTop + this.outerHeight(childNode),
                dif = pos - innerPageHeight

            if (forceManuelBreak && manualBreakSelector) {
                offsetTop = this.createPageBreakDiv(childNode)
            } else if (dif >= 20) {

                let noBreak = false
                if (noBreakClassName) {
                    noBreakClassName.forEach(cn => {
                        if (childNode.classList.contains(cn)) {
                            noBreak = true
                        }
                    })
                }

                // A break is needed
                if (!noBreak && (childNode.tagName === 'TD' || childNode.tagName === 'TH' || childNode.tagName === 'TR')) {
                    // special treatment for breaks within a table
                    offsetTop = this.createPageBreakTd(childNode)
                } else if (!noBreak && !manualBreakSelector && childNode.hasChildNodes() && childNode.childNodes[0].nodeType !== Node.TEXT_NODE) {
                    offsetTop = this.setBreakRec(childNode, {offsetTop, PAGE_HEIGHT, paddingBottom, paddingTop, rootNode: rootNode || node})
                } else {
                    if(rootNode) {
                        let viewtop = childNode.getBoundingClientRect().top
                        while (childNode.parentNode !== rootNode) {
                            if (viewtop - childNode.parentNode.getBoundingClientRect().top < 3) {
                                childNode = childNode.parentNode
                            } else {
                                break
                            }
                        }
                    }
                    offsetTop = this.createPageBreakDiv(childNode)
                }
            }
        })
        return offsetTop
    }

    createPageBreakTd(childNode) {
        const holderNode = childNode.tagName === 'TR' ? childNode : childNode.parentNode,
            br = document.createElement('tr'),
            td = document.createElement('td')
        td.className = this.props.classes.pageBreak
        td.colSpan = 99
        td.style.border = 'none'
        br.appendChild(td)
        holderNode.parentNode.insertBefore(br, holderNode)
        return this.offsetTop(br)
    }

    createPageBreakDiv(childNode) {
        let br = document.createElement('div')
        br.className = this.props.classes.pageBreak
        childNode.parentNode.insertBefore(br, childNode)
        return this.offsetTop(br)
    }

    offsetTop(e) {
        if(!e || e.nodeType === Node.TEXT_NODE){
            return document.documentElement.scrollTop
        }
        const r = e.getBoundingClientRect()
        return r.top + document.documentElement.scrollTop
    }

    outerHeight(element) {
        if(!element ||element.nodeType === Node.TEXT_NODE){
            return 0
        }

        const height = element.offsetHeight,
            style = window.getComputedStyle(element)

        return ['top', 'bottom']
            .map(side => parseInt(style[`margin-${side}`]))
            .reduce((total, side) => total + side, height)
    }

    isInFixedContainer(element) {
        let currentElement = element;

        while (currentElement && currentElement !== document.body) {
            const computedStyle = window.getComputedStyle(currentElement);

            if (computedStyle.position === "fixed") {
                return true; // A fixed-position container is found
            }

            currentElement = currentElement.parentElement; // Move up the DOM tree
        }

        return false; // No fixed-position container found
    }
}


Print.propTypes = {
    children: PropTypes.any,
    style: PropTypes.object,
    classes: PropTypes.object.isRequired
}

export default injectSheet(styles)(Print)
