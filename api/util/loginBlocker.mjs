
const LOGIN_ATTEMPTS_MAP = {},
    MAX_LOGIN_ATTEMPTS = 10,
    LOGIN_DELAY_IN_SEC = 180


export const hasTooManyInvalidLoginAttempts = (ip) => {

    if (LOGIN_ATTEMPTS_MAP[ip] && LOGIN_ATTEMPTS_MAP[ip].count >= MAX_LOGIN_ATTEMPTS) {
        const time = new Date().getTime()

        if (time - LOGIN_ATTEMPTS_MAP[ip].lasttry < LOGIN_DELAY_IN_SEC * 1000) {
            return true
        } else {
            delete LOGIN_ATTEMPTS_MAP[ip]
        }
    }
    return false
}

export const addInvalidLoginAttempt = (ip) => {

    if (!LOGIN_ATTEMPTS_MAP[ip]) {
        LOGIN_ATTEMPTS_MAP[ip] = {count: 0}
    }
    LOGIN_ATTEMPTS_MAP[ip].lasttry = new Date().getTime()
    LOGIN_ATTEMPTS_MAP[ip].count++

}

export const clearInvalidLoginAttempt = (ip) => {
    if (LOGIN_ATTEMPTS_MAP[ip]) {
        delete LOGIN_ATTEMPTS_MAP[ip]
    }
}