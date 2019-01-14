import {ObjectId} from 'mongodb'

export default function (db) {
    let cache = {},
        readyToCommit = [],
        counter = 0,
        clientAddress = (req) => {
            return (req.headers['x-forwarded-for'] || '').split(',')[0]
                || req.connection.remoteAddress
        },
        commit = (db, readyToCommit) => {
            const bulk = db.collection('UserStats').initializeUnorderedBulkOp()
            readyToCommit.forEach(o => {
                bulk.insert(o)
            })
            bulk.execute()

        }

    return {
        initialize: (req, res, next) => {
            counter++

            const {context, headers} = req

            const userData = {ip: clientAddress(req), agent: headers['user-agent'], url: req.originalUrl}

            if (context) {
                const {id} = context
                userData.user = ObjectId(id)
            }

            req.userStatsId = counter
            cache[counter] = userData
            let body = ''
            if (headers['content-type'] === 'application/json') {
                req.on('data', chunk => {
                    body += chunk.toString()
                })
            }
            res.on('finish', () => {
                if( body ){
                    userData.requestBody = body
                }
                readyToCommit.push(userData)
                delete cache[req.userStatsId]
            })

            if (readyToCommit.length > 1) {
                // commit
                commit(db, readyToCommit)

                readyToCommit = []
            }

            next()
        },
        exit: () => {
            console.log('commit unsafed data')
        },
        addData: (req, data) => {
            if (cache[req.userStatsId]) {
                Object.keys(data).forEach(k => {
                    cache[req.userStatsId][k] = data[k]
                })
            } else {
                console.warn("userStatsId missing", req.userStatsId)
            }
        }
    }
}
