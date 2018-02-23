import React from 'react'
import PropTypes from 'prop-types'
import {graphql, compose} from 'react-apollo'
import gql from 'graphql-tag'
import {DrawerLayout, Button, Typography, Divider} from 'ui/admin'
import {withKeyValues} from 'client/containers/generic/withKeyValues'
import {withRouter} from 'react-router-dom'
import PrettyResume from '../components/PrettyResume'
import FileDrop from 'client/components/FileDrop'


const withLinkedInCallback = (Container) => {


    return (props) =>{

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

class LinkedInCallback extends React.Component {

    render(){

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

    handleCsv = (file, data) => {

        const j = csvToJson(data)
        if (j.length > 0) {
            if (j[0].firstName && j[0].headline) {
                // this might be the profile data
                this.setState({data: {...this.state.data, ...j[0]}})
            } else if (j[0].companyName ) {
                this.setState({data: {...this.state.data, positions: {values: j}}})
            } else if (j[0].schoolName ) {
                this.setState({data: {...this.state.data, education: {values: j}}})
            }else{
                console.log(j)
            }
        }

    }


    render() {
        const {linkedin} = this.props
        const {disconnected, data} = this.state

        console.log('render linkedin')
        if (!linkedin || disconnected)
            return <Button variant="raised" onClick={this.handelLinkedInConnect}>Connect with LinkedIn</Button>


        return (
            <div>
                <Button variant="raised" onClick={this.handleLinkedInDisconnect}>Disconnect with LinkedIn</Button>

                <Typography>Login into your LinkedIn account -> My Account -> Settings & Privacy -> Download your
                    Data</Typography>
                <FileDrop multi onFileContent={this.handleCsv} accept="text/csv" label="Drop linked in cvs files here"/>


                <PrettyResume resumeData={{...linkedin,...data}}/>
            </div>
        )
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
            if( array[i].length ===1 && array[i][0]=== '') continue

            objArray[i - 1] = {}
            for (var k = 0; k < array[0].length && k < array[i].length; k++) {
                var key = array[0][k]
                objArray[i - 1][key] = array[i][k]
            }
        }
    }

    return objArray
}