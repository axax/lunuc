import React from 'react'
import PropTypes from 'prop-types'
import {graphql, compose} from 'react-apollo'
import gql from 'graphql-tag'
import {DrawerLayout, Button, Typography} from 'ui/admin'
import {withKeyValues} from 'client/containers/generic/withKeyValues'
import {withRouter} from 'react-router-dom'
import PrettyResume from '../components/PrettyResume'
class LinkedInProfileContainer extends React.Component {

    state = {
        linkedInCode: null
    }

    componentWillMount() {
        const {location, history, keyValueMap} = this.props
        const params = new URLSearchParams(location.search)
        const code = params.get('code'), state = params.get('state')
        if (code) {
            if (state == keyValueMap.linkedInState) {
                this.props.setKeyValue({key: 'linkedInCode', value: code}).then(() => {
                    history.push(location.pathname)
                })
            }
        }
    }

    handelLinkedInConnect = () => {
        const linkedInRedirectUrl = `${window.location.protocol}//${window.location.hostname}:${window.location.port}${this.props.location.pathname}`,
            linkedInBase = 'https://www.linkedin.com/oauth/v2/authorization?response_type=code',
            linkedInClientId = '772exdl15hhf0d',
            linkedInState = Math.random().toString(36).substr(2),
            linkedInAuthUrl = `${linkedInBase}&client_id=${linkedInClientId}&state=${linkedInState}&redirect_uri=${encodeURIComponent(linkedInRedirectUrl)}`
        this.props.setKeyValue({key: 'linkedInState', value: linkedInState}).then(() => {
            window.location.href = linkedInAuthUrl
        })
    }

    handleLinkedInDisconnect = () => {
        this.setState({linkedInCode: null})
        this.props.deleteKeyValue({key: 'linkedInCode'})
    }


    componentWillReceiveProps(nextProps) {
        const {keyValues} = nextProps
        this.setState({linkedInCode: (keyValues && keyValues.results ? keyValues.results.find(x => x.key === 'linkedInCode') : null)})
    }

    render() {
        const {linkedin} = this.props
        const {linkedInCode} = this.state

        if (!linkedInCode || !linkedin)
            return <Button raised onClick={this.handelLinkedInConnect}>Connect with LinkedIn</Button>


        return (
            <div>
                <img src={linkedin.pictureUrl}/>
                <p>
                    <strong>{linkedin.firstName} {linkedin.lastName} ({linkedin.headline})</strong><br />
                    {linkedin.summary}
                </p>
                <Button raised onClick={this.handleLinkedInDisconnect}>Disconnect with LinkedIn</Button>

                <PrettyResume resumeData={linkedin} />
            </div>
        )
    }
}


LinkedInProfileContainer.propTypes = {
    loading: PropTypes.bool,
    linkedin: PropTypes.object,
    /* with key values */
    keyValues: PropTypes.object,
    keyValueMap: PropTypes.object,
    setKeyValue: PropTypes.func.isRequired,
    deleteKeyValue: PropTypes.func.isRequired
}


const gqlQuery = gql`query linkedin($redirectUri: String!){linkedin(redirectUri:$redirectUri){headline firstName lastName pictureUrl publicProfileUrl summary positions{_total values{title summary}}}}`
const LinkedInProfileContainerWithGql = compose(
    graphql(gqlQuery, {
        options(ownProps) {
            const redirectUri = `${window.location.href}`
            return {
                variables: {
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

export default withRouter(withKeyValues(LinkedInProfileContainerWithGql, ['linkedInCode', 'linkedInState']))

