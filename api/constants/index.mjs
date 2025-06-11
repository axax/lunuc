export const AUTH_HEADER = 'authorization'
export const SESSION_HEADER = 'x-session'
export const HOSTRULE_HEADER = 'x-host-rule'
export const USE_COOKIES = true
export const CONTENT_LANGUAGE_HEADER = 'content-language'
export const AUTH_SCHEME = 'JWT'
export const SECRET_KEY = process.env.LUNUC_SECRET_KEY || 'fa-+3452sdfas!ä$$34dää$' /* set your own SECRET_KEY here. Only the server must know it */
export const AUTH_EXPIRES_IN = process.env.LUNUC_AUTH_EXPIRES_IN || '60d'
export const AUTH_EXPIRES_IN_COOKIE = process.env.LUNUC_AUTH_EXPIRES_IN_COOKIE || (1000 * 60 * 60 * 24 * 60)

export const HEADER_TIMEOUT = 60 * 1000 * 60 // 60min --> is important for file upload that might take longer
