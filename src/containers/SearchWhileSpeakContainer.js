import React from 'react'
import PropTypes from 'prop-types'
import {withApollo} from 'react-apollo'
import ApolloClient from 'apollo-client'


class SearchWhileSpeakContainer extends React.Component {

	recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition || window.mozSpeechRecognition || window.msSpeechRecognition)()

	state = {
		recording: false,
		recorded: [],
		search: ''
	}

	constructor(props) {
		super(props)
	}

	componentDidMount() {
		const self = this
		this.recognition.lang = 'en-US'
		this.recognition.interimResults = false
		this.recognition.maxAlternatives = 1
		this.recognition.continuous = true

		this.recognition.onresult = function(event) {
			self.setState((state) => ({ recorded: state.recorded.concat(event.results[0][0].transcript)}))
		}
		this.recognition.onend = function(e) {
			if( self.state.recording ) {
				self.recognition.start()
			}
		}

		if( this.state.recording ) {
			this.recognition.start()
		}
	}


	handleInputChange = (e) => {
		const target = e.target
		const value = target.type === 'checkbox' ? target.checked : target.value
		const name = target.name

		this.setState({
			[target.name]: value
		})
	}



	render() {

		let pairs = []

		this.state.recorded.forEach(
			(k,i) => pairs.push(<p key={i}>{k}</p>)
		)

		console.log('render')
		return <div><h1>Search</h1><input type="text" name="search" value={this.state.search} onChange={this.handleInputChange}/>Recorder: {this.state.recording?'on':'off'}{pairs}</div>
	}
}




SearchWhileSpeakContainer.propTypes = {
	client: PropTypes.instanceOf(ApolloClient).isRequired
}
const SearchWhileSpeakContainerWithApollo = withApollo(SearchWhileSpeakContainer)


export default SearchWhileSpeakContainerWithApollo