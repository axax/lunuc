var _Environments = {
	production:  {REDUX_PERSIST:true},
	staging:     {REDUX_PERSIST:true},
	development: {REDUX_PERSIST:true}
}

function getEnvironment() {
	// Insert logic here to get the current platform (e.g. staging, production, etc)
	var platform = 'development'

	// ...now return the correct environment
	return _Environments[platform]
}

const Environment = getEnvironment()

export default Environment