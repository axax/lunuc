import React from 'react'
import PropTypes from 'prop-types'
import {withApollo} from 'react-apollo'
import ApolloClient from 'apollo-client'
import {gql, graphql, compose} from 'react-apollo'
import {connect} from 'react-redux'


class SearchWhileSpeakContainer extends React.Component {

    recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition || window.mozSpeechRecognition || window.msSpeechRecognition)()

    constructor(props) {
        super(props)
        this.state = {
            recording: true,
            recorded: [],
            search: '',
            language: 'de-DE'
        }
    }

    componentDidMount() {
        this.createRecorder()
    }

    componentWillUnmount() {
        this.recognition.abort()
    }

    componentWillReceiveProps(nextProps) {
        if (nextProps.me.settings.speechLang.selection && nextProps.me.settings.speechLang.selection.key !== this.state.language) {
            this.setState({language: nextProps.me.settings.speechLang.selection.key})
        }
    }

    translate = ({text,toIso}) => {

        const {client} = this.props

        return client.query({
            fetchPolicy: 'cache-first',
            query: gql`query translate($text: String!, $toIso: String){translate(text: $text, toIso: $toIso ){text fromIso toIso }}`,
            variables: {
                text,
                toIso
            },
        })
    }

    createRecorder = () => {
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
            console.log(results)

            for (const result of results) {
                if (result.isFinal) {

                    for (const alternativ of result) {
                        console.log(alternativ)
                        if (alternativ.confidence > 0.60) {
                            /*self.translate({text:alternativ.transcript,toIso:'sv'}).then(response => {
                                var msg = new SpeechSynthesisUtterance(response.data.translate.text)
                                msg.lang = response.data.translate.toIso
                                //msg.pitch = 2
                                window.speechSynthesis.speak(msg)

                            }).catch(error => {
                                console.log(error)
                            })*/

                            self.setState((state) => ({recorded: state.recorded.concat(alternativ.transcript)}))

                        }
                    }
                }
            }
        }
        this.recognition.onend = function (e) {
            this.recognizing = false
            console.log('end')
            self.handleRecorder(self.state.recording)
        }
        this.handleRecorder(this.state.recording)
    }


    handleRecorder = (start) => {
        if (start) {
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
        }
        if (name === 'language') {

            this.props.updateMe({speechLang: value}).then(() => {
                console.log('change language to', value)

                this.recognition.lang = value
            })
        }
    }


    render() {
        if( !this.props.me )
            return null

        const langs = this.props.me.settings.speechLang.data
        console.log(this.props.me.settings.speechLang)

        let pairs = []

        this.state.recorded.forEach(
            (k, i) => pairs.push(<p key={i}>{k}</p>)
        )

        console.log('render', this.state)
        return <div><h1>Search</h1><input type="text" name="search" value={this.state.search}
                                          onChange={this.handleInputChange}/>
            <select name="language" value={this.state.language} onChange={this.handleInputChange}>
                {langs.map((lang, i) => {
                    return <option key={i} value={lang.key}>{lang.name}</option>
                })}
            </select>
            <input
                name="recording"
                type="checkbox"
                checked={this.state.recording}
                onChange={this.handleInputChange}/>
            Recorder: {this.state.recording ? 'on' : 'off'}{pairs}
        </div>
    }
}


SearchWhileSpeakContainer.propTypes = {
    client: PropTypes.instanceOf(ApolloClient).isRequired,
    me: PropTypes.object,
    updateMe: PropTypes.func.isRequired
}


const SearchWhileSpeakContainerWithGql = compose(
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
)(SearchWhileSpeakContainer)


const SearchWhileSpeakContainerWithApollo = withApollo(SearchWhileSpeakContainerWithGql)


export default SearchWhileSpeakContainerWithApollo