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
            recording: false,
            recorded: [],
            search: '',
            language: (props.me.settings.speechLang.selection?props.me.settings.speechLang.selection.key:'en-US')
        }
	}

	componentDidMount() {
		this.createRecorder()
	}

	componentWillUnmount(){
		this.recognition.abort()
	}

    componentWillReceiveProps(nextProps) {
        if (nextProps.me.settings.speechLang.selection &&  nextProps.me.settings.speechLang.selection.key !== this.state.language) {
            this.setState({ language: nextProps.me.settings.speechLang.selection.key })
        }
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

			for (const result of results) {
				if( result.isFinal ){

					for (const alternativ of result) {
						console.log(alternativ)
						if( alternativ.confidence > 0.75){

							/*var msg = new SpeechSynthesisUtterance(alternativ.transcript)
							msg.lang = self.state.language
							//msg.pitch = 2
							window.speechSynthesis.speak(msg)*/


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
			if( !this.recognition.recognizing ){
				this.recognition.start()
			}
		}else{
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

		if( target.type === 'checkbox' ) {
			this.handleRecorder(value)
		}
		if( name === 'language'){
            this.props.updateMe({speechLang:value}).then(()=>{
                console.log('change language to',value)
                this.recognition.lang = value
            })
		}
	}


	render() {

	    const langs = this.props.me.settings.speechLang.data

		let pairs = []

		this.state.recorded.forEach(
			(k, i) => pairs.push(<p key={i}>{k}</p>)
		)

		console.log('render', this.state)
		return <div><h1>Search</h1><input type="text" name="search" value={this.state.search}
																			onChange={this.handleInputChange}/>
			<select name="language" value={this.state.language} onChange={this.handleInputChange}>
                {langs.map((lang,i) => {
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
    me: PropTypes.object.isRequired,
    updateMe: PropTypes.func.isRequired,
}




const SearchWhileSpeakContainerWithGql = compose(
    graphql(gql`query {me{_id settings{speechLang{selection{key name}data{key name}}}}}`, {
        props: ({data: {loading, me }}) => ({
            me,
            loading
        })
    }),
    graphql(gql`mutation updateMe($speechLang: String!){updateMe(settings: {speechLang:$speechLang}){_id settings{speechLang{selection{key name}}}}}`, {
        props: ({ownProps, mutate}) => ({
            updateMe: ({speechLang}) => {
                return mutate({
                    variables: {speechLang},

                })
            }
        })
    })
)(SearchWhileSpeakContainer)


const SearchWhileSpeakContainerWithApollo = withApollo(SearchWhileSpeakContainerWithGql)


export default SearchWhileSpeakContainerWithApollo