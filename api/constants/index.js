export const AUTH_HEADER = 'authorization'
export const SESSION_HEADER = 'x-session'
export const CONTENT_LANGUAGE_HEADER = 'content-language'
export const AUTH_SCHEME = 'JWT'
export const SECRET_KEY = process.env.LUNUC_SECRET_KEY || 'fa-+3452sdfas!ä$$34dää$' /* set your own SECRET_KEY here. Only the server must know it */
export const AUTH_EXPIRES_IN = process.env.LUNUC_AUTH_EXPIRES_IN || '7d'


export const HEADER_TIMEOUT = 15 * 1000 * 60 // 15min --> is important for file upload that take longer
