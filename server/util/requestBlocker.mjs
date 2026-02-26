
// if there are more than {REQUEST_MAX_PER_TIME} request in {REQUEST_TIME_IN_MS}ms the remote ip gets blocked for {REQUEST_BLOCK_IP_FOR_IN_MS}ms
const DEFAULT_REQUEST_TIME_IN_MS = 10000, /* 10s */
    DEFAULT_REQUEST_MAX_PER_TIME = 2000,
    DEFAULT_REQUEST_BLOCK_FOR_IN_MS = 60000 * 5
const ipMap = {}, blockedIps = {}
let reqCounter = 0

export const isTemporarilyBlocked = ({
                                         req,
                                         key,
                                         requestPerTime = DEFAULT_REQUEST_MAX_PER_TIME,
                                         requestTimeInMs = DEFAULT_REQUEST_TIME_IN_MS,
                                         requestBlockForInMs = DEFAULT_REQUEST_BLOCK_FOR_IN_MS
                                     }) => {
    const now = Date.now()

    if (blockedIps[key]) {
        if (now - blockedIps[key].start > requestBlockForInMs) {
            delete blockedIps[key]
        } else {
            console.log(`${key} is temporarily blocked due to too many requests in a short time`)
            req?.connection?.destroy()
            return true
        }
    }

    if (!ipMap[key] || now - ipMap[key].start > requestTimeInMs) {
        ipMap[key] = { start: now, count: 0 }
    }
    ipMap[key].count++

    if (ipMap[key].count > requestPerTime) {
        blockedIps[key] = { start: now }
        delete ipMap[key]
        req?.connection?.destroy()
        return true
    }

    if (++reqCounter > 100) {
        reqCounter = 0
        for (const ip in ipMap) {
            if (now - ipMap[ip].start > requestTimeInMs + 1000) {
                delete ipMap[ip]
            }
        }
    }

    return false
}