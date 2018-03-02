import React from 'react'
import PropTypes from 'prop-types'
import {graphql, compose} from 'react-apollo'
import gql from 'graphql-tag'
import {DrawerLayout, Button, Typography, Divider, Col, Row} from 'ui/admin'
import {withKeyValues} from 'client/containers/generic/withKeyValues'
import {withRouter} from 'react-router-dom'
import PrettyResume from '../components/PrettyResume'
import FileDrop from 'client/components/FileDrop'
import _t from 'util/i18n'


const withLinkedInCallback = (Container) => {


    return (props) => {

        const {location, history} = props
        const params = new URLSearchParams(location.search)
        const code = params.get('code'), state = params.get('state')
        if (code) {
            if (state === sessionStorage.getItem('linkedInState')) {
                sessionStorage.removeItem('linkedInState')
                sessionStorage.setItem('linkedInCode', code)
                history.push(location.pathname)

                return null
            }
        }

        return <Container linkedInCode={sessionStorage.getItem('linkedInCode')} {...props} />
    }
}

class LinkedInProfileContainer extends React.Component {

    constructor(props) {
        super(props)
        this.state = {
            data: null,
            disconnected: false
        }
    }

    handelLinkedInConnect = () => {
        const linkedInRedirectUrl = `${window.location.protocol}//${window.location.hostname}:${window.location.port}${this.props.location.pathname}`,
            linkedInBase = 'https://www.linkedin.com/oauth/v2/authorization?response_type=code',
            linkedInClientId = '772exdl15hhf0d',
            linkedInState = Math.random().toString(36).substr(2),
            linkedInAuthUrl = `${linkedInBase}&client_id=${linkedInClientId}&state=${linkedInState}&redirect_uri=${encodeURIComponent(linkedInRedirectUrl)}`

        // store temporarily
        sessionStorage.setItem('linkedInState', linkedInState)
        window.location.href = linkedInAuthUrl
    }

    handleLinkedInDisconnect = () => {
        sessionStorage.removeItem('linkedInCode')
        this.setState({disconnected: true})
    }

    handleFiles = (files) => {

        const relevant = {
            'Profile.csv': '',
            'Positions.csv': 'positions',
            'Education.csv': 'education',
            'Projects.csv': 'projects',
            'Skills.csv': 'skills',
            'Courses.csv': 'courses',
            'Causes You Care About.csv': 'interests',
            'Languages.csv': 'languages'
        }
        let c = 0, data = this.state.data
        files.forEach(f => {
            if (relevant[f.name] !== undefined) {
                c++
                const reader = new FileReader()
                reader.readAsText(f, "UTF-8")
                reader.onload = e => {

                    const j = csvToJson(e.target.result)

                    if (j.length > 0) {
                        if (relevant[f.name]) {
                            data = {...data, [relevant[f.name]]: {values: j}}
                        } else {
                            data = {...data, ...j[0]}
                        }
                    }

                    c--
                    if (c === 0)
                        this.setState({data})
                }
            }
        })
    }

    offsetTop(e){
    }

    createPdf() {
        if (!html2canvas) return
        if (!pdfMake) return

        const $ = (expr, p) => (p || document).querySelectorAll(expr),
            enlargeFac = 1,
            pageHeight = 1430 * enlargeFac,
            pageWidth = 1020 * enlargeFac,
            ol = $('.cv-overlay')[0],
            pa = $('.cv-printarea:not(.cv-scaled)')[0].cloneNode(true),
            pai = $('.cv-printarea-inner', pa)[0],
            offsetTop = pai.offsetTop,
            pdfContent = [],
            cpc = $('.cv-print-clone')[0]

        ol.style.display = 'flex'

        Object.assign(pa.style, {
            transform: 'scale(' + enlargeFac + ',' + enlargeFac + ')',
            overflow: 'hidden'
        })
        pa.className += ' cv-scaled'

        cpc.appendChild(pa)

        this.calculatePageBreaks($, pa, pageHeight)

        const breaks = $('.cv-pagebreak', pai)


        const nextPage = page => {
            ol.innerText = `Please be patient... It might take some time... Page ${page + 1} of ${breaks.length + 1} is being produced`

            const fi = $('.full-invisible', pa)
            if (fi && fi.length > 0) {
                fi[0].classList.remove('full-invisible')
            }

            let marginTop = 0
            if (page > 0) {
                pai.style.marginTop = 0
                let br = breaks[page - 1]
                marginTop = br.offsetTop - offsetTop
            }
            console.log('marginTop', marginTop)

            if (page < breaks.length) {
                let elem = breaks[page]
                while (elem = elem.nextSibling) {
                    if (elem.nodeType === 3) continue; // text node
                    console.log(elem)
                    elem.classList.add('full-invisible')
                }
            }
            pai.style.marginTop = (-marginTop / enlargeFac) + 'px'
            html2canvas(pa, {
                imageTimeout: 20000,
                width: pageWidth,
                height: pageHeight,
                /*logging: true,*/
                /*proxy: ( (ENV=="development" )?"linkedin/src/php/html2canvasproxy.php":"php/html2canvasproxy.php"),*/
            }).then(canvas => {

                var data = canvas.toDataURL();
                pdfContent.push({
                    image: data,
                    width: 600
                })

                if (page < breaks.length) {
                    nextPage(page + 1);
                } else {
                    // $pai.css({marginTop:0})
                    //$pa.css({overflow:"visible",height:"auto"})
                    cpc.innerHTML = ''

                    //  window.open(data);

                    var docDefinition = {
                        pageMargins: [0, 0, 0, 0],
                        pageSize: 'A4',

                        content: pdfContent
                    }
                    ol.innerText = 'Please be patient... We are almost there... Enjoy!'

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
                    pdfMake.createPdf(docDefinition).download("cv.pdf", () => {
                        ol.style.display = 'none'
                    })
                    /*}*/
                }
            })


        }
        nextPage(0)
        console.log(pai)

        /* const doc = new jsPDF()

         doc.text('Hello world!', 10, 10)
         doc.save('a4.pdf')*/
    }

    calculatePageBreaks($, pa, pageHeight) {
        if (pa.clientHeight < pageHeight || pa.clientHeight === this.lastprintheight) {
            return
        }
        this.lastprintheight = pa.clientHeight


        console.log('calculatePageBreaks')

        const pai = $('.cv-printarea-inner', pa)[0],
            offsetTop = pai.offsetTop

        $('.cv-pagebreak', pa).forEach(n => {
            n.parentNode.removeChild(n)
        })
        let marginTop = 0

        pai.childNodes.forEach(section => {
            let pos = section.offsetTop - offsetTop + section.offsetHeight

            if (pos > marginTop + pageHeight) {

                let breakWasSet = false
                const kids = $('.timeline-section', section)
                for (let i = 0; i < kids.length; i++) {

                    const subsection = kids[i]
                    pos = section.offsetTop+subsection.offsetTop+subsection.parentNode.offsetTop - offsetTop + subsection.clientHeight

                    if (pos > marginTop + pageHeight) {
                        breakWasSet = true
                        const prevSubsction = subsection.previousSibling

                        const br = document.createElement('div')
                        br.className += 'cv-pagebreak'

                        if (prevSubsction.classList.contains('timeline-seperator')) {
                            prevSubsction.parentNode.insertBefore(br, prevSubsction)
                        } else {

                            subsection.parentNode.insertBefore(br, subsection)
                        }

                        marginTop = section.offsetTop + br.offsetTop + br.parentNode.offsetTop - offsetTop

                    }


                }

                if (!breakWasSet) {
                    const br = document.createElement('div')
                    br.className += 'cv-pagebreak'

                    section.parentNode.insertBefore(br, section)
                    marginTop = br.offsetTop - offsetTop
                    breakWasSet = true
                }

            }
        })
    }

    render() {
        const {linkedin} = this.props
        const {disconnected, data} = this.state

        console.log('render linkedin')

        return <div className="linkedin-container">
            {!linkedin || disconnected ? <Button variant="raised" color="primary"
                                                 onClick={this.handelLinkedInConnect}>{_t('social.linkedin.connect')}</Button> :
                <Row>
                    <Col md={3}>

                        <Typography variant="headline" gutterBottom={true}>Enhance your CV</Typography>

                        <Typography variant="caption">Login into your LinkedIn account -> My Account -> Settings &
                            Privacy -> Download
                            your
                            Data</Typography>
                        <FileDrop style={{marginBottom: "2rem"}} multi onFiles={this.handleFiles} accept="text/csv"
                                  label="Drop linked in cvs files here"/>

                        <Button variant="raised" color="primary"
                                onClick={this.createPdf.bind(this)}>{_t('social.linkedin.createpdf')}</Button>


                        <Button variant="raised"
                                onClick={this.handleLinkedInDisconnect}>{_t('social.linkedin.disconnect')}</Button>
                    </Col>
                    <Col md={9}>
                        <PrettyResume resumeData={{...linkedin, ...data}}/>
                    </Col>
                </Row>
            }
        </div>
    }
}


LinkedInProfileContainer.propTypes = {
    loading: PropTypes.bool,
    linkedin: PropTypes.object
}


const gqlQuery = gql`query linkedin($redirectUri: String!, $linkedInCode: String){linkedin(redirectUri:$redirectUri,linkedInCode:$linkedInCode){headline firstName lastName pictureUrl publicProfileUrl summary positions{_total values{title summary}}}}`
const LinkedInProfileContainerWithGql = compose(
    graphql(gqlQuery, {
        skip: props => !props.linkedInCode && !localStorage.getItem('token'),
        options(props) {
            const redirectUri = `${window.location.href}`
            return {
                variables: {
                    linkedInCode: props.linkedInCode,
                    redirectUri
                },
                fetchPolicy: 'cache-and-network'
            }
        },
        props: ({data: {loading, linkedin}}) => ({
            linkedin,
            loading
        })
    })
)(LinkedInProfileContainer)


export default withRouter(withLinkedInCallback(LinkedInProfileContainerWithGql))


function CSVToArray(strData, strDelimiter) {
    // Check to see if the delimiter is defined. If not,
    // then default to comma.
    strDelimiter = (strDelimiter || ",");
    // Create a regular expression to parse the CSV values.
    var objPattern = new RegExp((
        // Delimiters.
    "(\\" + strDelimiter + "|\\r?\\n|\\r|^)" +
    // Quoted fields.
    "(?:\"([^\"]*(?:\"\"[^\"]*)*)\"|" +
    // Standard fields.
    "([^\"\\" + strDelimiter + "\\r\\n]*))"), "gi");
    // Create an array to hold our data. Give the array
    // a default empty first row.
    var arrData = [[]];
    // Create an array to hold our individual pattern
    // matching groups.
    var arrMatches = null;
    // Keep looping over the regular expression matches
    // until we can no longer find a match.
    while (arrMatches = objPattern.exec(strData)) {
        // Get the delimiter that was found.
        var strMatchedDelimiter = arrMatches[1];
        // Check to see if the given delimiter has a length
        // (is not the start of string) and if it matches
        // field delimiter. If id does not, then we know
        // that this delimiter is a row delimiter.
        if (strMatchedDelimiter.length && (strMatchedDelimiter != strDelimiter)) {
            // Since we have reached a new row of data,
            // add an empty row to our data array.
            arrData.push([]);
        }
        // Now that we have our delimiter out of the way,
        // let's check to see which kind of value we
        // captured (quoted or unquoted).
        if (arrMatches[2]) {
            // We found a quoted value. When we capture
            // this value, unescape any double quotes.
            var strMatchedValue = arrMatches[2].replace(
                new RegExp("\"\"", "g"), "\"");
        } else {
            // We found a non-quoted value.
            var strMatchedValue = arrMatches[3];
        }
        // Now that we have our value string, let's add
        // it to the data array.
        arrData[arrData.length - 1].push(strMatchedValue);
    }
    // Return the parsed data.
    return (arrData);
}

function csvToJson(csv) {
    var array = CSVToArray(csv)
    var objArray = []


    if (array.length > 0) {
        // change header line
        for (let k = 0; k < array[0].length; k++) {
            const name = array[0][k].replace(/\s/g, '')
            array[0][k] = name.substring(0, 1).toLowerCase() + name.substring(1)
        }

        for (var i = 1; i < array.length; i++) {
            if (array[i].length === 1 && array[i][0] === '') continue

            objArray[i - 1] = {}
            for (var k = 0; k < array[0].length && k < array[i].length; k++) {
                var key = array[0][k]
                objArray[i - 1][key] = array[i][k]
            }
        }
    }

    return objArray
}