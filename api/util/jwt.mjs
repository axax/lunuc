import jwt from 'jsonwebtoken'
import {AUTH_SCHEME,SECRET_KEY} from '../constants/index.mjs'


export const decodeToken = (token) => {
    let result = {}
    if (token) {
        try {
            const matches = token.match(/(\S+)\s+(\S+)/)
            if (matches && matches.length > 1 && matches[1] === AUTH_SCHEME) {
                // verify a token symmetric - synchronous
                jwt.verify(matches[2], SECRET_KEY, (err, decoded) => {
                    if (!err) {
                        result = decoded
                    } else {
                        console.error('decodeToken verify error', err)
                    }
                })
            }
            result.auth = token
        }catch (e){
            console.error('decodeToken error', err)
        }
    }
    return result
}
