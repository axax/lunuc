import React from 'react'
import PropTypes from 'prop-types'
import {withApollo} from 'react-apollo'
import ApolloClient from 'apollo-client'
import {gql, graphql, compose} from 'react-apollo'
import {connect} from 'react-redux'


class LiveSpeechTranslaterContainer extends React.Component {

    mounted = false
    recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition || window.mozSpeechRecognition || window.msSpeechRecognition)()

    constructor(props) {
        super(props)
        this.state = {
            recording: true,
            recorded: [],
            language: 'de-DE',
            languageTo: 'en',
            data: []
        }
    }

    componentDidMount() {
        this.mounted=true
        this.createRecorder()
    }

    componentWillUnmount() {
        this.mounted=false
        this.recognition.abort()
    }

    componentWillReceiveProps(nextProps) {
        if (nextProps.me.settings.speechLang.selection && nextProps.me.settings.speechLang.selection.key !== this.state.language) {
            this.setState({language: nextProps.me.settings.speechLang.selection.key,languageTo: nextProps.me.settings.translateLang.selection.key})
        }
    }


    translate = ({text,toIso,fromIso}) => {
        const {client} = this.props
        return client.query({
            fetchPolicy: 'cache-first',
            query: gql`query translate($text: String!, $toIso: String!, $fromIso: String){translate(text: $text, toIso: $toIso, fromIso: $fromIso ){text fromIso toIso }}`,
            variables: {
                text,
                toIso,
                fromIso
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

        var isSpeacking=false

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
                        if (alternativ.confidence > 0.60) {

                            self.translate({text:alternativ.transcript,toIso:self.state.languageTo,fromIso:self.state.language.substr(0,2)}).then(response => {
                                isSpeacking=true
                                self.handleRecorder(false)

                                var msg = new SpeechSynthesisUtterance(response.data.translate.text)
                                msg.lang = response.data.translate.toIso
                                //msg.pitch = 2
                                window.speechSynthesis.speak(msg)


                                msg.onend = function(event) {
                                    isSpeacking=false
                                    self.handleRecorder(self.state.recording)
                                }

                                self.setState((state) => ({recorded: state.recorded.concat(alternativ.transcript+' = '+response.data.translate.text)}))

                            }).catch(error => {
                                console.log(error)
                            })


                        }
                    }
                }
            }
        }
        this.recognition.onend = function (e) {
            this.recognizing = false
            if( !isSpeacking ) {
                self.handleRecorder(self.state.recording)
            }
        }
        this.handleRecorder(this.state.recording)
    }


    handleRecorder = (start) => {
        if (start && this.mounted ) {
            if (!this.recognition.recognizing) {
                this.recognition.start()
            }
        } else {
            this.recognition.stop()
            this.recognition.abort()
            this.recognition.recognizing = false
        }
    }


    handleInputChange = (e) => {
        const target = e.target
        const value = target.type === 'checkbox' ? target.checked : target.value
        const name = target.name
        this.setState({
            [target.name]: value
        },() => {
            if (target.type === 'checkbox') {
                this.handleRecorder(value)
            } else if (name === 'language' || name === 'languageTo') {
                this.props.updateMe({speechLang: this.state.language, translateLang: this.state.languageTo}).then(() => {
                    this.recognition.lang = this.state.language
                })
            }
        })


    }


    render() {
        if (!this.props.me)
            return null

        const speechLang = this.props.me.settings.speechLang.data, translateLang = this.props.me.settings.translateLang.data

        let pairs = []

        this.state.recorded.forEach(
            (k, i) => pairs.push(<p key={i}>{k}</p>)
        )

        return <div><h1>Translate</h1>
            From
            <select disabled={!this.state.recording} name="language" value={this.state.language}
                    onChange={this.handleInputChange}>
                {speechLang.map((lang, i) => {
                    return <option key={i} value={lang.key}>{lang.name}</option>
                })}
            </select>
            to
            <select disabled={!this.state.recording} name="languageTo" value={this.state.languageTo}
                    onChange={this.handleInputChange}>
                {translateLang.map((lang, i) => {
                    if( lang.key==='auto') return null
                    return <option key={i} value={lang.key}>{lang.name}</option>
                })}
            </select>
            <input
                name="recording"
                type="checkbox"
                checked={this.state.recording}
                onChange={this.handleInputChange}/>
            Voice Recorder: {this.state.recording ? 'on' : 'off'}

            <input type="number" />


            {pairs}
        </div>
    }
}


LiveSpeechTranslaterContainer.propTypes = {
    client: PropTypes.instanceOf(ApolloClient).isRequired,
    me: PropTypes.object,
    updateMe: PropTypes.func.isRequired
}


const LiveSpeechTranslaterContainerWithGql = compose(
    graphql(gql`query {me{_id settings{speechLang{selection{key name}data{key name}}translateLang{selection{key name}data{key name}}}}}`, {
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
    graphql(gql`mutation updateMe($speechLang: String!,$translateLang: String!){updateMe(settings: {speechLang:$speechLang, translateLang:$translateLang}){_id settings{speechLang{selection{key name}}translateLang{selection{key name}}}}}`, {
        props: ({ownProps, mutate}) => ({
            updateMe: ({speechLang,translateLang}) => {
                return mutate({
                    variables: {speechLang,translateLang}
                })
            }
        })
    })
)(LiveSpeechTranslaterContainer)


const LiveSpeechTranslaterContainerWithApollo = withApollo(LiveSpeechTranslaterContainerWithGql)


export default LiveSpeechTranslaterContainerWithApollo