import React from 'react'
import PropTypes from 'prop-types'
import DomUtil from 'client/util/dom'
import Util from 'client/util'
import injectSheet from 'react-jss'
import {_t, registerTrs} from '../../util/i18n'
import classNames from 'classnames'

const PAGE_HEIGHT = 1430, PAGE_WIDTH= 1010

const styles = {
    button: {
        height: '30px',
        backgroundColor: '#46b8da',
        cursor:'pointer',
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
        width: PAGE_WIDTH+'px',
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
    invisible: {
        visibility: 'hidden !important',
        '& *': {
            visibility: 'hidden !important'
        }
    },
    pageBreak: {
        width: '100%',
       /* borderTop: 'dashed 1px #ffd633',*/
        position: 'relative',
        top:0,
       /* '&:after': {
            position: 'absolute',
            right: '10px',
            display: 'block',
            content: '"Page break"',
            color: '#000',
            fontSize: '0.7em',
            background: '#ffd633',
            padding: '3px'
        }*/
    }
}

class Print extends React.PureComponent {

    constructor(props) {
        super(props)

        registerTrs({
            de:{
                "Print.almostDone": "Bitte warten... Das PDF ist gleich fertiggestellt!",
                "Print.createPage": "Bitte warten... Es kann ein wenig dauern... Seite %page% von %numberOfPages% ist erstellt.",
            },
            en:{
                "Print.almostDone": "Please be patient... We are almost there... Enjoy!",
                "Print.createPage": "Please be patient... It might take some time... Page %page% of %numberOfPages% is being produced"
            }
        }, 'Print')

        DomUtil.addScript('https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.70/pdfmake.min.js',{id: 'pdfmake'})
        DomUtil.addScript('https://html2canvas.hertzen.com/dist/html2canvas.min.js', {id: 'html2canvas'})
    }

    componentDidMount() {
        if(this.props.onCustomEvent){
            this.props.onCustomEvent(this)
        }
        if (this.props.createOnMount) {
            setTimeout(() => {
                this.createPdfWait()
            }, 300)
        }else{

            setTimeout(() => {
            const {classes} = this.props

            const printArea = this.$(`.${classes.printArea}`)[0],
                printAreaInner = this.$(`.${classes.printAreaInner}`, printArea)[0]



            const offsetTop = this.offsetTop(printArea),
                paddingTop = parseInt(window.getComputedStyle(printArea, null).getPropertyValue('padding-top')),
                paddingBottom = parseInt(window.getComputedStyle(printArea, null).getPropertyValue('padding-bottom'))


                this.calculatePageBreaks({printAreaInner,paddingTop,paddingBottom,offsetTop})

            }, 300)
        }


    }

    render() {
        const {classes, children, style, printAreaInnerStyle, buttonLabel, className, showButtons} = this.props
        return <div className={classNames(classes.root,className)}>
            {showButtons!==false && <button className={classes.button}
                    onClick={this.createPdf.bind(this)}>{buttonLabel || 'Create PDF'}</button>}
            <div className={classes.overlay}></div>
            <div className={classes.wrapper}>
                <div className={classNames(classes.printArea,'print-area')} style={style}>
                    <div className={classNames(classes.printAreaInner,'print-area-inner')} style={printAreaInnerStyle}>{children}</div>
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

    createPdf() {
        if (!window.html2canvas) return false
        if (!window.pdfMake) return false

        const {classes, pdfName, showDate, scale} = this.props
        const overlay = this.$(`.${classes.overlay}`)[0],
            printArea = this.$(`.${classes.printArea}`)[0],
            printAreaInner = this.$(`.${classes.printAreaInner}`, printArea)[0],
            pdfContent = []

        overlay.style.display = 'flex'


        const offsetTop = this.offsetTop(printArea),
            paddingTop = parseInt(window.getComputedStyle(printArea, null).getPropertyValue('padding-top')),
            paddingBottom = parseInt(window.getComputedStyle(printArea, null).getPropertyValue('padding-bottom'))

        setTimeout(()=> {


            this.calculatePageBreaks({printAreaInner,paddingTop,paddingBottom,offsetTop})
         /*  ol.style.display = 'none'
            return*/

            const breaks = this.$('.' + classes.pageBreak, printAreaInner)


            const nextPage = page => {
                overlay.innerText = _t('Print.createPage', {page: page + 1, numberOfPages: breaks.length + 1})

                /*const fi = this.$(`.${classes.invisible}`, pa)
                if (fi && fi.length > 0) {
                    for (let i = 0; i < fi.length; i++)
                        fi[i].classList.remove(classes.invisible)
                }*/

                let marginTop, marginTopLast
                const isLastPage = breaks.length===page, isFirstPage = page===0

                if(!isLastPage ){
                    marginTop = this.offsetTop(breaks[page]) - offsetTop + this.outerHeight(breaks[page])
                }
                if(!isFirstPage) {
                    marginTopLast = this.offsetTop(breaks[page - 1]) - offsetTop + this.outerHeight(breaks[page - 1])
                }

                html2canvas(printArea, {
                    imageTimeout: 20000,
                    width: PAGE_WIDTH - 1,
                    height: PAGE_HEIGHT,
                    scale: scale || 1,
                    scrollX: -window.scrollX - 7,
                    scrollY: page>0?-(marginTopLast-paddingTop+window.scrollY):-window.scrollY,
                    /*logging: true,*/
                    /*proxy: ( (ENV=="development" )?"linkedin/src/php/html2canvasproxy.php":"php/html2canvasproxy.php"),*/
                }).then(canvas => {


                    const createCanvas = document.createElement('canvas')
                    createCanvas.height=canvas.height
                    createCanvas.width=canvas.width
                    const context = createCanvas.getContext('2d')
                    context.clearRect(0, 0, canvas.width, canvas.height)

                    context.drawImage(canvas,0,0)

                    context.fillStyle = "white"
                    if(!isFirstPage ){
                        context.fillRect(0, 0, canvas.width, paddingTop)
                    }

                    if(!isLastPage ){
                        let h = (page+1)*PAGE_HEIGHT -(page*(paddingTop+paddingBottom))-marginTop
                       context.fillRect(0, canvas.height-h, canvas.width, h)
                    }

                    // draw page number
                    context.textBaseline = "top"
                    context.font = "10px sans-serif"
                    context.fillStyle = "rgba(0,0,0,0.5)"
                    context.fillText((page + 1) + ' / '+(breaks.length + 1)+ (showDate ? ' - '+Util.formatDate(new Date()):''), 10, canvas.height-20)


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
                        /*}*/
                    }
                })


            }
            nextPage(0)

            /* const doc = new jsPDF()

             doc.text('Hello world!', 10, 10)
             doc.save('a4.pdf')*/
        },1000) // little delay for images

        return true
    }


    calculatePageBreaks({printAreaInner,paddingTop,paddingBottom,offsetTop}) {

        const {classes} = this.props
        //remove existing breaks
        this.$('.' + classes.pageBreak, printAreaInner).forEach(n => {
            n.parentNode.removeChild(n)
        })

        if (printAreaInner.clientHeight < PAGE_HEIGHT) {
            return
        }

        console.log('calculatePageBreaks')

        this.setBreakRec(printAreaInner,{offsetTop,PAGE_HEIGHT,paddingBottom,paddingTop})

    }

    setBreakRec(node, {offsetTop,paddingBottom,paddingTop}){

        const innerPageHeight = PAGE_HEIGHT - paddingTop -paddingBottom

        node.childNodes.forEach(childNode => {

            const newOffsetTop = this.offsetTop(childNode)
            let pos = newOffsetTop - offsetTop + this.outerHeight(childNode)

            if (pos > innerPageHeight ) {

                if(childNode.hasChildNodes() && childNode.childNodes[0].nodeType !== Node.TEXT_NODE ){
                    offsetTop =this.setBreakRec(childNode,{offsetTop,PAGE_HEIGHT,paddingBottom,paddingTop})
                }else{

                    let br, holderNode, height


                    if(childNode.tagName==='TD' || childNode.tagName==='TH' || childNode.tagName==='TR'){

                        holderNode = childNode.tagName==='TR'?childNode:childNode.parentNode
                        height = (pos - innerPageHeight +this.outerHeight(holderNode))+'px'

                        br = document.createElement('tr')
                        const td = document.createElement('td')
                        td.className = this.props.classes.pageBreak
                        td.colSpan = 99
                        /*td.style.height = height*/
                        br.appendChild(td)

                      /*  childNode.style.position = 'relative'
                        br.style.position = 'absolute'
                        childNode.appendChild(br)*/
                    }else{

                        height = (pos - innerPageHeight +this.outerHeight(childNode))+'px'
                        br = document.createElement('div')
                        br.className = this.props.classes.pageBreak
                       /* br.style.height = height*/
                        holderNode = childNode
                    }


                    holderNode.parentNode.insertBefore(br, holderNode)
                    offsetTop = this.offsetTop(br)+ paddingBottom + paddingTop

                }

            }



        })
        return offsetTop
    }


    offsetTop(e) {
        const r = e.getBoundingClientRect()
        return r.top + document.documentElement.scrollTop
    }

    outerHeight(element) {
        const height = element.offsetHeight,
            style = window.getComputedStyle(element)

        return ['top', 'bottom']
            .map(side => parseInt(style[`margin-${side}`]))
            .reduce((total, side) => total + side, height)
    }


}


Print.propTypes = {
    children: PropTypes.any,
    style: PropTypes.object,
    classes: PropTypes.object.isRequired
}

export default injectSheet(styles)(Print)
