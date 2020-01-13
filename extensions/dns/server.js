import Hook from '../../util/hook'
import dns from 'native-dns'
import schemaGen from './gensrc/schema'
import resolverGen from './gensrc/resolver'
import {deepMergeToFirst} from 'util/deepMerge'
import Util from '../../api/util'
import cron from "node-cron";

let server = null
let database = null
let hosts = {}
let dbBuffer = []


// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolverGen(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schemaGen)
})

// Hook when db is ready
Hook.on('appready', async ({db, context}) => {

    const dnsSettings = (await Util.getKeyValueGlobal(db, context, "DnsSettings", true)) || {}

    console.log("DnsSettings", dnsSettings)
    if (!dnsSettings.execfilter || Util.execFilter(dnsSettings.execfilter)) {

        database = db
        readHosts(db)


        console.log('create dns server')
        server = dns.createServer()


        server.on('request', (req, res) => {
            const hostname = req.question[0].name


            if (hosts[hostname] === undefined) {
                hosts[hostname] = {block: false, subdomains:false}
            }

            if(!hosts[hostname].count){
                hosts[hostname].count=0
            }
            hosts[hostname].count++

            let block = hosts[hostname].block === true

            if (!block) {
                //check subdomains
                let subname = hostname
                let pos = subname.indexOf('.')
                while (pos >= 0) {
                    subname = subname.substring(pos + 1)
                    if (hosts[subname] && hosts[subname].block === true && hosts[subname].subdomains === true) {
                        block = true
                        break
                    }
                    pos = subname.indexOf('.')
                }
            }


            if (block) {
                console.log(`block host ${hostname}`)
                res.answer.push(dns.A({
                    name: hostname,
                    address: '0.0.0.0',
                    ttl: 1,
                }))
                res.send()
            } else {

                console.log(`resolve host ${hostname}`)
                const dnsRequest = dns.Request({
                    question: req.question[0],
                    server: {address: '1.1.1.1', port: 53, type: 'udp'},
                    timeout: 1000
                })

                dnsRequest.on('timeout', () => {
                    console.log('Timeout in making request')
                })

                dnsRequest.on('message', (err, answer) => {
                    answer.answer.forEach((a) => {
                        res.answer.push(a)
                    })
                })

                dnsRequest.on('end', () => {
                    res.send()
                })

                dnsRequest.send()
            }
            dbBuffer.push({
                updateOne: {
                    filter: { name: hostname },
                    update: {
                        $set: {
                            lastIp: req._socket._remote.address,
                            lastUsed: new Date().getTime(),
                            name: hostname,
                            count: hosts[hostname].count
                        }
                    },
                    upsert: true
                }
            })

            if( dbBuffer.length > 100) {
                insertBuffer()
            }
        })

        server.on('error', (err, buff, req, res) => {
            console.log(err.stack)
        })


        server.on('listening', () => {
            console.log('dns listening')
        })

        server.on('listening', () => {
            console.log('dns close')
        })

        server.serve(53)
    }


})

// Hook when the type CronJob has changed
Hook.on('typeUpdated_DnsHost', ({result}) => {
    if (result.name && hosts[result.name]) {
        if( result.block !== undefined) {
            hosts[result.name].block = result.block
        }
        if( result.subdomains !== undefined) {
            hosts[result.name].subdomains = result.subdomains
        }
    }
})

Hook.on('appexit', async () => {
    await insertBuffer()
})


const readHosts = async (db) => {
    (await db.collection('DnsHost').find().forEach(o => {
        hosts[o.name] = {block: o.block, subdomains: o.subdomains, count: o.count}
    }))
}


const insertBuffer= async () => {
    if (database) {
        console.log('insert buffer')
        await database.collection('DnsHost').bulkWrite(dbBuffer, { ordered: false })
        dbBuffer = []
    }
}

