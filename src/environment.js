var _Environments = {
	production:  {APOLLO_CACHE: true, DEBUG: false },
	staging:     {APOLLO_CACHE: true, DEBUG: false },
	development: {APOLLO_CACHE: true, DEBUG: true }
}

function getEnvironment() {
	// Insert logic here to get the current platform (e.g. staging, production, etc)
	var platform = 'development'

	// ...now return the correct environment
	return _Environments[platform]
}

const Environment = getEnvironment()

export default Environment