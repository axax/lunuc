import React from 'react'
import PropTypes from 'prop-types'
import {withApollo} from 'react-apollo'
import ApolloClient from 'apollo-client'
import {graphql, compose} from 'react-apollo'
import gql from 'graphql-tag'
import BaseLayout from 'client/components/layout/BaseLayout'
import {withKeyValues} from 'client/containers/generic/withKeyValues'
import {
    Button,
    TextField,
    Typography,
    SimpleSelect,
    SimpleSwitch,
    Card,
    ContentBlock,
    Divider,
    VolumeUpIcon,
    VolumeUpIconButton
} from 'ui/admin'

class LiveSpeechTranslaterContainer extends React.Component {

    recognition = false
    mounted = false

    constructor(props) {
        super(props)
        const rec = window.SpeechRecognition || window.webkitSpeechRecognition || window.mozSpeechRecognition || window.msSpeechRecognition
        if (rec) {
            this.recognition = new ( rec)()
        }
        this.state = {
            text: '',
            speaking: false,
            recording: true,
            recorded: [],
            language: 'de-DE',
            languageTo: 'en',
            data: [],
            maxResults: 10,
            autoSpeech: false
        }
    }

    static getDerivedStateFromProps(nextProps, prevState) {
        const settings = nextProps.keyValueMap.LiveSpeechTranslaterContainerState
        if (settings && prevState.settings !== settings) {
            const language = settings.language || prevState.language
            const languageTo = settings.languageTo || prevState.languageTo
            if (language && languageTo) {
                console.log('LiveSpeechTranslaterContainer renew state')
                return Object.assign({}, prevState, {language, languageTo, settings})
            }
        }
        return null
    }


    componentDidMount() {
        this.mounted = true
        this.createRecorder()
    }

    componentWillUnmount() {
        this.mounted = false
        this.handleRecorder(false)
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

        this.sSpeacking = false

        this.recognition.onstart = function () {
            this.recognizing = true
        }

        this.recognition.onerror = function (event) {
            console.warn(event)
            this.recognizing = false
        }

        this.recognition.onresult = function (event) {

            const results = event.results

            for (const result of results) {
                if (result.isFinal) {

                    for (const alternativ of result) {
                        //console.log(alternativ)
                        if (alternativ.confidence > 0.50) {

                            self.translate(alternativ.transcript)
                        }
                    }
                }
            }
        }
        this.recognition.onend = function (e) {
            console.log('recording ended', e)
            this.recognizing = false
            if (!self.state.speaking) {
                self.handleRecorder(self.state.recording)
            }
        }
        this.handleRecorder(this.state.recording)
    }


    translate = (text) => {
        this.translateRequest({
            text,
            toIso: this.state.languageTo,
            fromIso: this.state.language.substr(0, 2)
        }).then(response => {

            if (this.state.autoSpeech) {

                this.speak(response.data.translate.text, response.data.translate.toIso)

            }
            const recorded = [{
                from: text,
                to: response.data.translate.text,
                lang: response.data.translate.toIso
            }, ...this.state.recorded]

            if (recorded.length > this.state.maxResults) {
                recorded.splice(this.state.maxResults)
            }

            this.setState({recorded})

        }).catch(error => {
            console.log(error)
        })
    }


    speak = (text, lang) => {
        this.handleRecorder(false)

        this.setState({speaking: true})

        const utterance = new SpeechSynthesisUtterance(text)
        utterance.lang = lang

        utterance.onend = () => {
            this.setState({speaking: false}, () => {
                this.handleRecorder(this.state.recording)
            })
        }

        utterance.onerror = (e) => {
            console.log("error in SpeechSynthesisUtterance", e)
            this.setState({speaking: false}, () => {
                this.handleRecorder(this.state.recording)
            })
        }

        setTimeout(() => {
            // if still speaking after 10s-> there is something wrong
            if (this.state.speaking) {
                this.setState({speaking: false}, () => {
                    this.handleRecorder(this.state.recording)
                })
            }
        }, 10000)

        //msg.pitch = 2
        window.speechSynthesis.speak(utterance)
    }


    translateRequest = ({text, toIso, fromIso}) => {
        const {client} = this.props
        return client.query({
            fetchPolicy: 'cache-first',
            query: gql`query translate($text: String!, $toIso: String!){translate(text: $text, toIso: $toIso){text toIso}}`,
            variables: {
                text,
                toIso,
                fromIso
            },
        })
    }

    handleRecorder = (start) => {
        if (!this.recognition)
            return false

        if (start && this.mounted) {
            if (!this.recognition.recognizing) {
                this.recognition.start()
            }
        } else {
            this.recognition.abort()
            this.recognition.recognizing = false
        }
    }

    translateTimeout = 0
    handleInputChange = (e) => {
        const target = e.target
        const value = target.type === 'checkbox' ? target.checked : target.value
        const name = target.name
        this.setState({
            [target.name]: value
        }, () => {
            if (target.type === 'checkbox') {
                this.handleRecorder(value)
            } else if (name === 'language' || name === 'languageTo') {
                this.props.setKeyValue({
                    key: 'LiveSpeechTranslaterContainerState',
                    value: {language: this.state.language, languageTo: this.state.languageTo}
                })
                if (name === 'langauge') {
                    this.createRecorder()
                }
            } else if (name === 'text') {
                /*clearTimeout(this.translateTimeout)
                if (value) {
                    this.translateTimeout = setTimeout(() => {
                        this.translate(value)
                    }, 500)
                }*/
            }
        })


    }


    render() {
        const {speechLanguages, translateLanguages} = this.props
        if (!speechLanguages && !translateLanguages) {
            return <BaseLayout><h1>No languages available</h1></BaseLayout>
        }

        return <BaseLayout>
            <Typography variant="h3" component="h1" gutterBottom>Translate {this.state.speaking && <VolumeUpIcon />}</Typography>


            {!this.recognition &&
            <Typography variant="subtitle1" gutterBottom>Unfortunately speech recognition is not supported by
                this browser. Check <a
                    href="http://caniuse.com/#feat=speech-recognition">Can I use</a> for browser
                support</Typography>}

            <ContentBlock>


                {this.recognition && <SimpleSelect hint="Language for speech recognition"
                                                   name='language'
                                                   onChange={this.handleInputChange}
                                                   value={this.state.language} items={speechLanguages.data}/>}

                <SimpleSelect hint="Language to translate to"
                              name='languageTo'
                              onChange={this.handleInputChange}
                              value={this.state.languageTo} items={translateLanguages.data}/>

                <SimpleSwitch
                    disabled={!this.recognition}
                    color="default"
                    label="Progressive voice recorder"
                    name="recording"
                    checked={this.state.recording}
                    onChange={this.handleInputChange}/>

                <SimpleSwitch
                    color="default"
                    label="Auto speech"
                    name="autoSpeech"
                    checked={this.state.autoSpeech}
                    onChange={this.handleInputChange}/>

            </ContentBlock>

            <ContentBlock>
                <TextField
                    type="search"
                    helperText={this.state.speaking ? 'Speaking...' : 'Enter a word or sentence that you wish to translate'}
                    disabled={this.state.recording && !!this.recognition} fullWidth
                    placeholder="Input" name="text" value={this.state.text}
                    onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                            this.translate(this.state.text)
                            this.setState({text:''})
                        }
                    }}
                    onChange={this.handleInputChange}/>

            </ContentBlock>

            {
                this.state.recorded.map(
                    (k, i) => <Card style={{marginBottom: '10px'}} key={i}>

                        <Typography color="textSecondary" gutterBottom>
                            {k.from}
                        </Typography>
                        <Divider style={{margin: '5px 0'}} light/>

                        <Typography variant="h5">
                            <VolumeUpIconButton onClick={()=>{
                                this.speak(k.to, k.lang)
                            }}/>{k.to}
                        </Typography>
                    </Card>
                )
            }
        </BaseLayout>
    }
}


LiveSpeechTranslaterContainer.propTypes = {
    client: PropTypes.instanceOf(ApolloClient).isRequired,
    speechLanguages: PropTypes.object,
    /* To get and set settings */
    setKeyValue: PropTypes.func.isRequired,
    keyValueMap: PropTypes.object
}


const LiveSpeechTranslaterContainerWithGql = compose(
    graphql(gql`query{speechLanguages{data{value name}}translateLanguages{data{value name}}}`, {
        options() {
            return {
                fetchPolicy: 'cache-and-network'
            }
        },
        props: ({data: {loading, speechLanguages, translateLanguages}}) => {
            return {
                translateLanguages,
                speechLanguages,
                loading
            }
        }
    })
)(LiveSpeechTranslaterContainer)


const LiveSpeechTranslaterContainerWithApollo = withApollo(LiveSpeechTranslaterContainerWithGql)


export default withKeyValues(LiveSpeechTranslaterContainerWithApollo, ['LiveSpeechTranslaterContainerState'])