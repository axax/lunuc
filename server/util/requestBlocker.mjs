
// if there are more than {REQUEST_MAX_PER_TIME} request in {REQUEST_TIME_IN_MS}ms the remote ip gets blocked for {REQUEST_BLOCK_IP_FOR_IN_MS}ms
const DEFAULT_REQUEST_TIME_IN_MS = 10000, /* 10s */
    DEFAULT_REQUEST_MAX_PER_TIME = 2000,
    DEFAULT_REQUEST_BLOCK_FOR_IN_MS = 60000 * 5
const ipMap = {}, blockedIps = {}
let reqCounter = 0

export const isTemporarilyBlocked = ({req, key, checkKeys, requestPerTime, requestTimeInMs, requestBlockForInMs}) => {

    if(!requestPerTime){
        requestPerTime = DEFAULT_REQUEST_MAX_PER_TIME
    }
    if(!requestTimeInMs){
        requestTimeInMs = DEFAULT_REQUEST_TIME_IN_MS
    }
    if(!requestBlockForInMs){
        requestBlockForInMs = DEFAULT_REQUEST_BLOCK_FOR_IN_MS
    }

    if(blockedIps[key] || (checkKeys && checkKeys.some(ck=>blockedIps[ck]))){
        // block for X min
        if(Date.now()-blockedIps[key].start>requestBlockForInMs){
            delete blockedIps[key]
        }else {
            console.log(key + ' is temporarily blocked due to too many request in a short time')
            if(req) {
                req.connection.destroy()
            }
            return true
        }
    }

    if(!ipMap[key] || Date.now()-ipMap[key].start>requestTimeInMs){
        ipMap[key] = {start:Date.now(),count:0}
    }
    ipMap[key].count++

    if(ipMap[key].count>requestPerTime){
        blockedIps[key] = {start:Date.now()}
        delete ipMap[key]
        if(req) {
            req.connection.destroy()
        }
        return true
    }

    reqCounter++

    if(reqCounter>100){
        // clean up
        reqCounter = 0
        for(const ip in ipMap){
            if(Date.now()-ip.start > requestTimeInMs+1000){
                delete ipMap[ip]
            }
        }
    }

    return false
}