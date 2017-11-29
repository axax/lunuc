var _Environments = {
	production:  {APOLLO_CACHE: true },
	staging:     {APOLLO_CACHE: true },
	development: {APOLLO_CACHE: true }
}

function getEnvironment() {
	// Insert logic here to get the current platform (e.g. staging, production, etc)
	var platform = 'development'

	// ...now return the correct environment
	return _Environments[platform]
}

const Environment = getEnvironment()

export default Environment