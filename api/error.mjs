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


// Request data is written to the Log collection on errors - never store credentials there.
const SENSITIVE_KEY = /pass|secret|token|authorization|cookie|api[-_]?key/i
const SENSITIVE_INLINE_ARG = /\b(\w*(?:pass|secret|token|api[-_]?key)\w*)(\s*:\s*)"(?:[^"\\]|\\.)*"/gi
const REDACTED = '[redacted]'

// returns a redacted deep copy, the original object is not touched
export function redactSensitive(value, depth = 0) {
	if (value === null || value === undefined) {
		return value
	}
	if (typeof value === 'string') {
		// literals written directly into a graphql query, e.g. login(password:"...")
		return value.replace(SENSITIVE_INLINE_ARG, (match, name, separator) => `${name}${separator}"${REDACTED}"`)
	}
	if (typeof value !== 'object') {
		return value
	}
	if (depth > 8) {
		return '[truncated]'
	}
	if (Array.isArray(value)) {
		return value.map(entry => redactSensitive(entry, depth + 1))
	}
	const result = {}
	for (const key of Object.keys(value)) {
		const entry = value[key]
		if (SENSITIVE_KEY.test(key) && entry !== null && entry !== undefined && entry !== '') {
			result[key] = REDACTED
		} else {
			result[key] = redactSensitive(entry, depth + 1)
		}
	}
	return result
}

/**
 * Given a GraphQLError, format it according to the rules described by the
 * Response Format, Errors section of the GraphQL Specification.
 */
export function formatAndLogError(db, req, error) {

	let o = {
		locations: error.locations,
		path: error.path,
		message: error.message
	}

	if (error.originalError) {
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

	// expected cases, not logged: a missing page and a concurrent change in the cms editor (handled by a dialog)
	if (error.message !== "Cms page doesn't exist" && o.key !== 'cms_page_conflict') {
		// Erweitere den errorContext um Request-Informationen
		Hook.call('graphqlError', {
			db,
			req,
			errorContext: {
				...o,
				stack: error.stack,
				// passwords, session cookies and tokens are replaced before logging
				request: {
					headers: redactSensitive(req.headers),
					body: redactSensitive(req.body),    // Request-Body ohne Zugangsdaten
					query: redactSensitive(req.query),  // URL-Parameter
					url: req.url,                       // Aufgerufener Pfad
					method: req.method,                 // GET, POST, etc.
				}
			},
			type: 'generalError'
		})
	}

	return o
}
