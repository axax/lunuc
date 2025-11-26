export const AUTH_HEADER = 'authorization'
export const SESSION_HEADER = 'x-session'
export const HOSTRULE_HEADER = 'x-host-rule'
export const CLIENT_ID_HEADER = 'x-client-id'
export const TRACK_REFERER_HEADER = 'x-track-referer'
export const TRACK_IP_HEADER = 'x-track-ip'
export const TRACK_URL_HEADER = 'x-track-url'
export const TRACK_IS_BOT_HEADER = 'x-track-is-bot'
export const TRACK_USER_AGENT_HEADER = 'x-track-user-agent'

export const FORWARDED_FOF_HEADER = 'x-forwarded-for'

export const USE_COOKIES = true
export const CONTENT_LANGUAGE_HEADER = 'content-language'
export const AUTH_SCHEME = 'JWT'
export const SECRET_KEY = process.env.LUNUC_SECRET_KEY || 'fa-+3452sdfas!ä$$34dää$' /* set your own SECRET_KEY here. Only the server must know it */
export const AUTH_EXPIRES_IN = process.env.LUNUC_AUTH_EXPIRES_IN || '240d'
export const AUTH_EXPIRES_IN_COOKIE = process.env.LUNUC_AUTH_EXPIRES_IN_COOKIE || (1000 * 60 * 60 * 24 * 240)

export const HEADER_TIMEOUT = 60 * 1000 * 60 // 60min --> is important for file upload that might take longer
