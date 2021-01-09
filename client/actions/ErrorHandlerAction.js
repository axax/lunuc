export const addError = ({key, msg}) => ({
	type: 'ADD_ERROR',
	key,
	msg
})

export const clearError = (key) => ({
	type: 'CLEAR_ERROR',
	key
})

export const clearErrors = () => ({
    type: 'CLEAR_ERRORS'
})
