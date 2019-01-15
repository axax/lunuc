import React from 'react'
import PropTypes from 'prop-types'
import {withApollo, Query} from 'react-apollo'
import ApolloClient from 'apollo-client'
import gql from 'graphql-tag'
import BaseLayout from 'client/components/layout/BaseLayout'
import {
    TextField,
    Typography,
    SimpleSelect,
    SimpleSwitch,
    Card,
    ContentBlock,
    Divider,
    withStyles
} from 'ui/admin'
import {withKeyValues} from 'client/containers/generic/withKeyValues'
import Util from 'client/util'

const styles = theme => ({
    card: {
        marginBottom: theme.spacing.unit * 2
    },
    divider: {
        marginTop: theme.spacing.unit,
        marginBottom: theme.spacing.unit
    },
    hightlight: {
        backgroundColor: '#FFF59D'
    }
})


class SearchWhileSpeechContainer extends React.Component {

    mounted = false
    recognition = false

    constructor(props) {
        super(props)

        const rec = window.SpeechRecognition || window.webkitSpeechRecognition || window.mozSpeechRecognition || window.msSpeechRecognition
        if (rec) {
            this.recognition = new ( rec)()
        }
        this.state = {
            recording: true,
            searchResults: [],
            search: '',
            language: 'en-GB',
            data: [],
            maxResults: 10
        }
    }

    static getDerivedStateFromProps(nextProps, prevState) {
        const {language} = nextProps.keyValueMap.SearchWhileSpeechContainerState || {}

        if (language && language !== prevState.language) {
            return Object.assign({}, prevState, {language})
        }
        return null
    }

    componentDidMount() {
        this.mounted = true
        this.createRecorder()
    }

    componentWillUnmount() {
        this.mounted = false
        if (this.recognition)
            this.recognition.abort()
    }


    search = ({query}) => {
        if (query === '')
            return
        const {client} = this.props
        client.query({
            fetchPolicy: 'cache-first',

            query: gql`query posts($query:String){posts(query:$query){results{title body searchScore search{headerOne unstyled}_id}}}`,
            variables: {
                query
            }
        }).then(response => {

            if (response.data && response.data.posts && response.data.posts.results) {
                const searchResults = [{query, data: response.data.posts.results}, ...this.state.searchResults]

                if (searchResults.length > this.state.maxResults) {
                    searchResults.splice(this.state.maxResults)
                }

                this.setState({
                    searchResults
                })
            }


        }).catch(error => {
            console.log(error)
        })
    }

    createRecorder = () => {
        if (!this.recognition)
            return false

        const self = this
        this.recognition.lang = this.state.language
        this.recognition.interimResults = false
        this.recognition.maxAlternatives = 1
        this.recognition.continuous = false
        this.recognition.recognizing = false // this is a custom flag to determin wheater recognition is running


        this.recognition.onstart = function () {
            this.recognizing = true
        }

        this.recognition.onerror = function (event) {
            this.recognizing = false
        }

        this.recognition.onresult = function (event) {
            const results = event.results

            for (const result of results) {
                if (result.isFinal) {

                    for (const alternativ of result) {
                        console.log(alternativ)
                        if (alternativ.confidence > 0.50) {
                            self.setState((state) => ({search: alternativ.transcript}))
                            self.search({query: alternativ.transcript})
                        }
                    }
                }
            }
        }
        this.recognition.onend = function (e) {
            this.recognizing = false
            self.handleRecorder(self.state.recording)
        }
        this.handleRecorder(this.state.recording)
    }


    handleRecorder = (start) => {
        if (!this.recognition)
            return false

        if (start && this.mounted) {
            if (!this.recognition.recognizing) {
                this.recognition.start()
            }
        } else {
            this.recognition.stop()
            this.recognition.abort()
        }
    }


    searchTimeout = 0
    handleInputChange = (e) => {
        const target = e.target
        const value = target.type === 'checkbox' ? target.checked : target.value
        const name = target.name
        this.setState({
            [target.name]: value
        })

        if (target.type === 'checkbox') {
            this.handleRecorder(value)
        } else if (name === 'language') {
            this.props.setKeyValue({key: 'SearchWhileSpeechContainerState', value: {language: value}})
        } else if (name === 'search') {
            clearTimeout(this.searchTimeout)
            this.searchTimeout = setTimeout(() => {
                this.search({query: value})
            }, 500)


            ///this.setState((state) => ({recorded: state.recorded.concat(value)}))

        }
    }

    render() {
        const {classes} = this.props

        console.log('render SearchWhileSpeechContainer')

        return <BaseLayout>
            <Typography variant="h3" component="h1" gutterBottom>Search</Typography>
            <Typography variant="subtitle1" gutterBottom>
                Search results are displayed continuously as you speak. At the moment only posts are included in the
                search. Make sure you have posts, otherwise you'll never get results.
            </Typography>


            <ContentBlock>
                {this.recognition ? [
                    <SimpleSwitch
                        key="recording"
                        color="default"
                        label="Voice recorder"
                        name="recording"
                        checked={this.state.recording}
                        onChange={this.handleInputChange}/>,
                    <Query key="query" query={gql`query{speechLanguages{data{value name}}}`}
                           fetchPolicy="cache-and-network">
                        {({loading, error, data}) => {
                            if (loading) return 'Loading...'
                            if (error) return `Error! ${error.message}`
                            if (!data.speechLanguages.data) return 'No data'

                            return <SimpleSelect disabled={!this.state.recording} name='language'
                                                 onChange={this.handleInputChange.bind(this)}
                                                 value={this.state.language} items={data.speechLanguages.data}/>
                        }}
                    </Query>
                ] :
                    <Typography variant="subtitle1" gutterBottom>Unfortunately speech recognition is not supported by
                        this browser. Check <a
                            href="http://caniuse.com/#feat=speech-recognition">Can I use</a> for browser
                        support</Typography>}

                <TextField fullWidth placeholder="Search expression" name="search" value={this.state.search}
                           onChange={this.handleInputChange}/>

            </ContentBlock>
            <Typography variant="subtitle2" gutterBottom>Results</Typography>

            {
                this.state.searchResults.map(
                    (k, i) => <Card className={classes.card}
                                    key={i}><Typography color="textSecondary" gutterBottom>
                        {k.query}
                    </Typography>
                        {k.data.map((k2, i2) => [
                            (i2 > 0 ?
                                <Divider light className={classes.divider} key={'divider' + i + '-' + i2}/> : null),
                            <Typography key={'main' + i + '-' + i2} variant="h5">
                                <span
                                    dangerouslySetInnerHTML={{__html: Util.hightlight(k2.title, k.query, classes.hightlight)}}/>
                            </Typography>,
                            <Typography key={'text' + i + '-' + i2}>
                                <span
                                    dangerouslySetInnerHTML={{__html: Util.hightlight(k2.search.unstyled, k.query, classes.hightlight)}}/>
                            </Typography>])}</Card>
                )
            }
        </BaseLayout>
    }
}


SearchWhileSpeechContainer.propTypes = {
    client: PropTypes.instanceOf(ApolloClient).isRequired,
    classes: PropTypes.object.isRequired,
    /* To get and set settings */
    setKeyValue: PropTypes.func.isRequired,
    keyValueMap: PropTypes.object
}


export default withKeyValues(withApollo(withStyles(styles, {withTheme: true})(SearchWhileSpeechContainer)), ['SearchWhileSpeechContainerState'])
