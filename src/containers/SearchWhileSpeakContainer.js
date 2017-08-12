import React from 'react'
import PropTypes from 'prop-types'
import {withApollo} from 'react-apollo'
import ApolloClient from 'apollo-client'


class SearchWhileSpeakContainer extends React.Component {

	recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition || window.mozSpeechRecognition || window.msSpeechRecognition)()

	state = {
		recording: false,
		recorded: [],
		search: '',
		language: 'en-US'
	}

	constructor(props) {
		super(props)
	}

	componentDidMount() {
		this.createRecorder()
	}

	componentWillUnmount(){
		this.recognition.abort()
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
			console.log('change language to',value)
			this.recognition.lang = value
		}
	}


	render() {

		let pairs = []

		this.state.recorded.forEach(
			(k, i) => pairs.push(<p key={i}>{k}</p>)
		)

		console.log('render')
		return <div><h1>Search</h1><input type="text" name="search" value={this.state.search}
																			onChange={this.handleInputChange}/>
			<select name="language" value={this.state.value} onChange={this.handleInputChange}>
				<option value="en-US">English</option>
				<option value="de-DE">Deutsch</option>
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
	client: PropTypes.instanceOf(ApolloClient).isRequired
}
const SearchWhileSpeakContainerWithApollo = withApollo(SearchWhileSpeakContainer)


export default SearchWhileSpeakContainerWithApollo