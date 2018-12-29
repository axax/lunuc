import React from 'react'
import PropTypes from 'prop-types'
import {withApollo} from 'react-apollo'
import ApolloClient from 'apollo-client'
import { graphql, compose} from 'react-apollo'
import gql from 'graphql-tag'
import BaseLayout from 'client/components/layout/BaseLayout'


class SearchWhileSpeechContainer extends React.Component {

    mounted = false
    recognition = false

    constructor(props) {
        super(props)
        const rec = window.SpeechRecognition || window.webkitSpeechRecognition || window.mozSpeechRecognition || window.msSpeechRecognition
        if( rec ){
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

    componentDidMount() {
        this.mounted=true
        this.createRecorder()
    }

    componentWillUnmount() {
        this.mounted=false
        if( this.recognition )
            this.recognition.abort()
    }

    componentWillReceiveProps(nextProps) {
        if (nextProps.me.settings.speechLang.selection && nextProps.me.settings.speechLang.selection.key !== this.state.language) {
            this.setState({language: nextProps.me.settings.speechLang.selection.key})
        }
    }



    search = ({query}) => {
        if( query === '' )
            return
        const {client} = this.props
        client.query({
            fetchPolicy: 'cache-first',
            query: gql`query posts($query: String){posts(query:$query){title body searchScore search{headerOne unstyled} _id}}`,
            variables: {
                query
            }
        }).then(response => {

            if( response.data && response.data.posts && response.data.posts.length > 0 ) {
                this.setState(prevState => ({
                    searchResults: [...prevState.searchResults, {query, data: response.data}]
                }))
                console.log(this.state.searchResults)
            }


        }).catch(error => {
            console.log(error)
        })
    }

    createRecorder = () => {
        if( !this.recognition )
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
                            self.setState((state) => ({search:alternativ.transcript}))
                            self.search({query:alternativ.transcript})
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
        if( !this.recognition )
            return false

        if (start && this.mounted ) {
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

            this.props.updateMe({speechLang: value}).then(() => {
                console.log('change language to', value)

                if( !this.recognition )
                    this.recognition.lang = value
            })
        } else if (name === 'search') {
            this.search({query:value})

            ///this.setState((state) => ({recorded: state.recorded.concat(value)}))

        }
    }


    render() {
        if (!this.props.me)
            return null

        const langs = this.props.me.settings.speechLang.data

        let pairs = []
        this.state.searchResults.forEach(
            (k, i) => k.data.posts.forEach( (k2, i2 ) => pairs.push(<p key={i+'-'+i2}>{k2.title} {k2.search.unstyled}</p>))
        )

        return <BaseLayout><h1>Search</h1>

            {this.recognition?<div>
                <select disabled={!this.state.recording} name="language" value={this.state.language}
                        onChange={this.handleInputChange}>
                    {langs.map((lang, i) => {
                        return <option key={i} value={lang.key}>{lang.name}</option>
                    })}
                </select>
                <input
                    name="recording"
                    type="checkbox"
                    checked={this.state.recording}
                    onChange={this.handleInputChange}/>
                Voice Recorder: {this.state.recording ? 'on' : 'off'}</div>:<div>Speech recognition is not supported by this browser. Check <a href="http://caniuse.com/#feat=speech-recognition">Can I use</a> for browser support</div>}


            <br />Search <input type="text" name="search" value={this.state.search}
                                          onChange={this.handleInputChange}/>

            {pairs}
        </BaseLayout>
    }
}


SearchWhileSpeechContainer.propTypes = {
    client: PropTypes.instanceOf(ApolloClient).isRequired,
    me: PropTypes.object,
    updateMe: PropTypes.func.isRequired
}


const SearchWhileSpeechContainerWithGql = compose(
    graphql(gql`query {me{_id settings{speechLang{selection{key name}data{key name}}}}}`, {
        options() {
            return {
                fetchPolicy: 'cache-and-network'
            }
        },
        props: ({data: {loading, me}}) => ({
            me,
            loading
        })
    }),
    graphql(gql`mutation updateMe($speechLang: String!){updateMe(settings: {speechLang:$speechLang}){_id settings{speechLang{selection{key name}}}}}`, {
        props: ({ownProps, mutate}) => ({
            updateMe: ({speechLang}) => {
                return mutate({
                    variables: {speechLang}
                })
            }
        })
    })
)(SearchWhileSpeechContainer)


const SearchWhileSpeechContainerWithApollo = withApollo(SearchWhileSpeechContainerWithGql)


export default SearchWhileSpeechContainerWithApollo