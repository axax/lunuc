import { GraphQLError } from 'graphql'


export class ApiError extends Error {
	constructor(message, key=null, data=null) {
		super(message)
		this.data = data
		this.key = key
	}
}


// Use this error for form validation. Add a list with errors to match the proper form field
export class ValidationError extends GraphQLError {
    constructor(errors) {
        super('Fehler beim Speichern des Objects')
        this.state = errors.reduce((result, error) => {
            if (Object.prototype.hasOwnProperty.call(result, error.key)) {
                result[error.key].push(error.message)
            } else {
                result[error.key] = [error.message]
            }
            return result
        }, {})
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
	if( error.originalError.state ){
		o.state = error.originalError.state
	}
	return o
}
