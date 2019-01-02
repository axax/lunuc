import React from 'react'
import PropTypes from 'prop-types'
import {withApollo, Query} from 'react-apollo'
import ApolloClient from 'apollo-client'
import gql from 'graphql-tag'
import BaseLayout from 'client/components/layout/BaseLayout'
import {
    Typography,
    SimpleSelect
} from 'ui/admin'
import {withKeyValues} from 'client/containers/generic/withKeyValues'

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
            language: 'de-DE',
            data: []
        }
    }

    static getDerivedStateFromProps(nextProps, prevState) {
        const language = (nextProps.keyValueMap.SearchWhileSpeechContainerState || {}).language
        if( language && language !== prevState.language ){
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

                this.setState(prevState => ({
                    searchResults: [...prevState.searchResults, {query, data: response.data.posts.results}]
                }))
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
            //this.search({query:value})

            ///this.setState((state) => ({recorded: state.recorded.concat(value)}))

        }
    }


    render() {

        let pairs = []
        this.state.searchResults.forEach(
            (k, i) => k.data.forEach((k2, i2) => pairs.push(<p
                key={i + '-' + i2}>{k2.title} {k2.search.unstyled}</p>))
        )

        console.log('render SearchWhileSpeechContainer')

        return <BaseLayout>
            <Typography variant="h3" component="h1" gutterBottom>Search</Typography>

            {this.recognition ? <div>

                <Query query={gql`query{speechLanguages{data{value name}}}`}
                       fetchPolicy="cache-and-network">
                    {({loading, error, data}) => {
                        if (loading) return 'Loading...'
                        if (error) return `Error! ${error.message}`
                        if (!data.speechLanguages.data) return 'No data'

                        return <SimpleSelect name='language' onChange={this.handleInputChange.bind(this)}
                                             value={this.state.language} items={data.speechLanguages.data}/>
                    }}
                </Query>


                <input
                    name="recording"
                    type="checkbox"
                    checked={this.state.recording}
                    onChange={this.handleInputChange}/>
                Voice Recorder: {this.state.recording ? 'on' : 'off'}</div> :
                <div>Speech recognition is not supported by this browser. Check <a
                    href="http://caniuse.com/#feat=speech-recognition">Can I use</a> for browser support</div>}


            <br />Search <input type="text" name="search" value={this.state.search}
                                onChange={this.handleInputChange}/>

            {pairs}
        </BaseLayout>
    }
}


SearchWhileSpeechContainer.propTypes = {
    client: PropTypes.instanceOf(ApolloClient).isRequired,
    /* To get and set settings */
    setKeyValue: PropTypes.func.isRequired,
    keyValueMap: PropTypes.object
}


export default withKeyValues(withApollo(SearchWhileSpeechContainer), ['SearchWhileSpeechContainerState'])
