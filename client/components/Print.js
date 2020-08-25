import React from 'react'
import PropTypes from 'prop-types'
import DomUtil from 'client/util/dom'
import injectSheet from 'react-jss'
import _t from '../../util/i18n'


const trans = {
    de:{
        "Print.almostDone": "Bitte warten... Das PDF ist gleich fertiggestellt!",
        "Print.createPage": "Bitte warten... Es kann ein wenig dauern... Seite %page% von %numberOfPages% ist erstellt.",
    },
    en:{
        "Print.almostDone": "Please be patient... We are almost there... Enjoy!",
        "Print.createPage": "Please be patient... It might take some time... Page %page% of %numberOfPages% is being produced"
    }
}

if(trans[_app_.lang]){
    Object.keys(trans[_app_.lang]).forEach(t=>{
        _app_.tr[t] = trans[_app_.lang][t]
    })
}


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
        padding: '3.5em'
    },
    wrapper: {
        margin: 'auto',
        display: 'block',
        width: '1020px',
        border: 'solid 1px #E5E5E5',
        boxShadow: '0 4px 8px 0 rgba(0,0,0,0.12),0 2px 4px 0 rgba(0,0,0,0.08)'
    },
    printArea: {
        backgroundColor: '#fff',
        fontFamily: '\'Roboto\', sans-serif',
        padding: '2rem',
        height: '100%'
    },
    printAreaInner: {
        '& img': {
            maxWidth: '100%'
        }
    },
    scaled: {
        '& $pageBreak': {
            border: 'none !important',
            '&:after': {
                display: 'none'
            }
        }

    },
    cloneArea: {
        width: '1020px' /* this is the paper size */
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
        borderTop: 'dashed 1px #ffd633',
        position: 'relative',
        '&:after': {
            position: 'absolute',
            right: '10px',
            display: 'block',
            content: 'Page break',
            color: '#000',
            fontSize: '0.7em',
            background: '#ffd633',
            padding: '3px'
        }
    }
}

class Print extends React.PureComponent {

    constructor(props) {
        super(props)

        DomUtil.addScript('https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.36/pdfmake.min.js')
        DomUtil.addScript('https://html2canvas.hertzen.com/dist/html2canvas.min.js')
    }

    componentDidMount() {
        if (this.props.createOnMount) {
            setTimeout(() => {
                this.createPdfWait()
            }, 300)
        }
    }

    render() {
        const {classes, children, style, buttonLabel} = this.props
        return <div className={classes.root}>
            <button className={classes.button}
                    onClick={this.createPdf.bind(this)}>{buttonLabel || 'Create PDF'}</button>
            <div className={classes.overlay}></div>
            <div className={classes.wrapper}>
                <div className={classes.printArea} style={style}>
                    <div className={classes.printAreaInner}>{children}</div>
                </div>
            </div>
            <div className={classes.cloneArea}></div>
        </div>

    }

    createPdfWait() {
        if (!this.createPdf()) {
            setTimeout(() => {
                this.createPdfWait()
            }, 300)
        }
    }


    createPdf() {
        if (!window.html2canvas) return false
        if (!window.pdfMake) return false

        const {classes, pdfName} = this.props
        const $ = (expr, p) => (p || document).querySelectorAll(expr),
            enlargeFac = 1,
            pageHeight = 1430 * enlargeFac,
            pageWidth = 1020 * enlargeFac,
            ol = $(`.${classes.overlay}`)[0],
            pa = $(`.${classes.printArea}:not(.${classes.scaled})`)[0].cloneNode(true),
            pai = $(`.${classes.printAreaInner}`, pa)[0],
            pdfContent = [],
            cpc = $(`.${classes.cloneArea}`)[0]

        ol.style.display = 'flex'

        Object.assign(pa.style, {
            transform: 'scale(' + enlargeFac + ',' + enlargeFac + ')',
            overflow: 'hidden'
        })
        pa.className += ` ${classes.scaled}`

        setTimeout(()=> {

            cpc.appendChild(pa)

            this.calculatePageBreaks($, pa, pageHeight)

            const breaks = $('.' + classes.pageBreak, pai),
                offsetTop = this.offsetTop(pai)

            const nextPage = page => {
                ol.innerText = _t('Print.createPage', {page: page + 1, numberOfPages: breaks.length + 1})

                const fi = $(`.${classes.invisible}`, pa)
                if (fi && fi.length > 0) {
                    for (let i = 0; i < fi.length; i++)
                        fi[i].classList.remove(classes.invisible)
                }

                let marginTop = 0
                if (page > 0) {
                    pai.style.marginTop = 0
                    let br = breaks[page - 1]
                    marginTop = this.offsetTop(br) - offsetTop + this.outerHeight(br)
                }
                console.log('marginTop', marginTop)

                if (page < breaks.length) {
                    let elem = breaks[page]
                    while (elem = elem.nextSibling) {
                        if (elem.nodeType === 3) continue // text node
                        elem.classList.add(classes.invisible)
                    }
                }
                pai.style.marginTop = (-marginTop / enlargeFac) + 'px'


                /*ol.style.display = 'none'

                return*/
                html2canvas(pa, {
                    imageTimeout: 20000,
                    width: pageWidth,
                    height: pageHeight,
                    /*logging: true,*/
                    /*proxy: ( (ENV=="development" )?"linkedin/src/php/html2canvasproxy.php":"php/html2canvasproxy.php"),*/
                }).then(canvas => {

                    var data = canvas.toDataURL()
                    pdfContent.push({
                        image: data,
                        width: 600
                    })

                    if (page < breaks.length) {
                        nextPage(page + 1)
                    } else {
                        // $pai.css({marginTop:0})
                        //$pa.css({overflow:"visible",height:"auto"})
                        cpc.innerHTML = ''

                        //window.open(data);

                        var docDefinition = {
                            pageMargins: [0, 0, 0, 0],
                            pageSize: 'A4',

                            content: pdfContent
                        }
                        ol.innerText = _t('Print.almostDone')

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
                            ol.style.display = 'none'
                        } else {
                            pdfMake.createPdf(docDefinition).download((pdfName || 'file') + '.pdf', () => {
                                ol.style.display = 'none'
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

    calculatePageBreaks($, pa, pageHeight) {
        if (pa.clientHeight < pageHeight || pa.clientHeight === this.lastprintheight) {
            return
        }
        const {classes} = this.props
        this.lastprintheight = pa.clientHeight


        console.log('calculatePageBreaks')

        const pai = $('.' + classes.printAreaInner, pa)[0],
            offsetTop = this.offsetTop(pai)

        $('.' + classes.pageBreak, pa).forEach(n => {
            n.parentNode.removeChild(n)
        })
        let marginTop = 0

        pai.childNodes.forEach(section => {
            let pos = this.offsetTop(section) - offsetTop + this.outerHeight(section)
            if (pos > marginTop + pageHeight) {

                let breakWasSet = false
                if(section.tagName==='TABLE') {

                    const kids = $('tr', section)
                    for (let i = 0; i < kids.length; i++) {

                        const subsection = kids[i]
                        pos = this.offsetTop(subsection) - offsetTop + this.outerHeight(subsection) + 30

                        if (pos > marginTop + pageHeight) {
                            breakWasSet = true
                            const prevSubsction = subsection.previousSibling

                            const br = document.createElement('tr')

                            const td = document.createElement('td')
                            td.className += classes.pageBreak
                            td.colSpan = 99
                            td.style.height = this.outerHeight(subsection) + pos - (marginTop + pageHeight)+'px'
                            br.appendChild(td)

                            subsection.parentNode.insertBefore(br, subsection)


                            marginTop = this.offsetTop(br) - offsetTop + this.outerHeight(br)

                        }


                    }
                }

                if (!breakWasSet) {
                    const br = document.createElement('div')
                    br.className += classes.pageBreak

                    section.parentNode.insertBefore(br, section)
                    marginTop = this.offsetTop(br) - offsetTop  + this.outerHeight(br)
                    breakWasSet = true
                }

            }
        })
    }

}


Print.propTypes = {
    children: PropTypes.any,
    style: PropTypes.object,
    classes: PropTypes.object.isRequired
}

export default injectSheet(styles)(Print)
