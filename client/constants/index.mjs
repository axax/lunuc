// admin-only queries are in ./admin.mjs, so they are not part of the main bundle


// used to store settings in local storage if there is no session
export const NO_SESSION_KEY_VALUES = 'NO_SESSION_KEY_VALUES'

// fields of a login result (password, passkey, second factor) - see LoginContainer.loginWithResponse
export const LOGIN_RESULT_FIELDS = 'token redirectUrl resetToken twoFactorToken error user{username requestNewPassword email _id role{_id capabilities}}'
