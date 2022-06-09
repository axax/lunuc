import {ObjectId} from 'mongodb'

import {clientAddress} from '../../util/host.mjs'


export default function (db) {
    let cache = {},
        readyToCommit = [],
        counter = 0,
        commit = async (db, readyToCommit) => {
            if (readyToCommit.length) {
                const bulk = await db.collection('UserStats').initializeUnorderedBulkOp()

                //Remove in standard for loop
                for (let i = 0; i < readyToCommit.length; i++) {
                    var item = readyToCommit[i]
                    bulk.insert(item)
                    readyToCommit.splice(i, 1)
                    i--
                }
                await bulk.execute()
            }

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
                if (body) {
                    userData.requestBody = body
                }
                readyToCommit.push(userData)
                delete cache[req.userStatsId]
            })

            if (readyToCommit.length > 10) {
                // commit
                commit(db, readyToCommit)
            }

            next()
        },
        exit: async () => {
            console.log('commit unsafed data')
            await commit(db, readyToCommit)
        },
        addData: (req, data) => {
            if (cache[req.userStatsId]) {
                Object.keys(data).forEach(k => {
                    cache[req.userStatsId][k] = data[k]
                })
            } else {
                console.warn('userStatsId missing', req.userStatsId)
            }
        }
    }
}
