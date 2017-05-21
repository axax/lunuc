import React from 'react'
import PropTypes from 'prop-types'
import {connect} from 'react-redux'
import {bindActionCreators} from 'redux'
import {gql, graphql, compose} from 'react-apollo'


class SearchWhileSpeakContainer extends React.Component {

	recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition || window.mozSpeechRecognition || window.msSpeechRecognition)()

	state = {
		recording: true,
		recorded: []
	}

	constructor(props) {
		super(props)
	}

	componentDidMount() {
		const self = this
		this.recognition.lang = 'en-US'
		this.recognition.interimResults = false
		this.recognition.maxAlternatives = 1
		//recognition.continuous = true

		this.recognition.onresult = function(event) {
			self.setState((state) => ({ recorded: state.recorded.concat(event.results[0][0].transcript)}))
		}
		this.recognition.onend = function(e) {
			console.log('restart')
			if( self.state.recording ) {
				self.recognition.start()
			}
		}

		if( this.state.recording ) {
			this.recognition.start()
		}
	}



	render() {


		let pairs = []

		this.state.recorded.forEach(
			(k,i) => pairs.push(<p key={i}>{k}</p>)
		)

		console.log('render')
		return <div><h1>Search</h1>Recorder: {this.state.recording?'on':'off'}{pairs}</div>
	}
}


export default SearchWhileSpeakContainer