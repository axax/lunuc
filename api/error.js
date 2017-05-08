

export class ApiError extends Error {
	constructor(message, key=null, data=null) {
		super(message)
		this.data = data
		this.key = key
	}
}



/**
 * Given a GraphQLError, format it according to the rules described by the
 * Response Format, Errors section of the GraphQL Specification.
 */
export function formatError(error) {

	let o = {
		locations: error.locations,
		path: error.path,
		message: error.message
	}
	if( error.originalError.key ){
		o.key = error.originalError.key
	}
	if( error.originalError.data ){
		o.data = error.originalError.data
	}

	return o
}