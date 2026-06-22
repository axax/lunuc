import { GraphQLError } from 'graphql'
import Hook from '../util/hook.cjs'


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
export function formatAndLogError(db,req,error) {

	let o = {
		locations: error.locations,
		path: error.path,
		message: error.message
	}
	if(error.originalError) {
		if (error.originalError.key) {
			o.key = error.originalError.key
		}
		if (error.originalError.data) {
			o.data = error.originalError.data
		}
		if (error.originalError.state) {
			o.state = error.originalError.state
		}
	}

	if(error.message!=="Cms page doesn't exist") {
		Hook.call('graphqlError', {db, req, errorContext: {...o,stack:error.stack}, type: 'generalError'})
	}

	return o
}
