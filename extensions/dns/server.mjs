import Hook from '../../util/hook.cjs'
import dns from 'native-dnssec-dns'
import {consts} from 'native-dnssec-dns-packet'
import schemaGen from './gensrc/schema'
import resolverGen from './gensrc/resolver'
import {deepMergeToFirst} from 'util/deepMerge.mjs'
import Util from '../../api/util/index.mjs'
let server = null
let database = null
let hosts = {}
let dbBuffer = {}


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

    let dnsSettings = (await Util.getKeyValueGlobal(db, context, "DnsSettings", true)) || {}

    console.log("DnsSettings", dnsSettings)
    if (true || !dnsSettings.execfilter || Util.execFilter(dnsSettings.execfilter)) {

        setInterval(async ()=>{
            dnsSettings =  (await Util.getKeyValueGlobal(db, context, "DnsSettings", true)) || {}
        }, 1000 * 60)

        database = db
        readHosts(db)


        console.log('DNS: create dns server')
        server = dns.createServer()

        server.on('request', (req, res) => {
            const hostname = req.question[0].name.slice(0, -1),
                type = req.question[0].type,
                startTime = new Date().getTime()

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


            if (block && !dnsSettings.disabled) {
                console.log(`DNS: block host ${hostname} type ${consts.qtypeToName(type)}`)
                res.answer.push(dns.A({
                    name: hostname,
                    address: '0.0.0.0',
                    ttl: 1,
                }))
                res.send()
            } else {

                console.log(`DNS: ${req._socket._remote.address}:${req._socket._remote.port} resolve host ${hostname} type ${consts.qtypeToName(type)}`)
                const dnsRequest = dns.Request({
                    question: req.question[0],
                    server: {address: '1.1.1.1', port: 53, type: 'udp'},
                    timeout: 1500
                })

                dnsRequest.on('timeout', () => {
                    console.log('DNS: Timeout in making request')
                })

                dnsRequest.on('message', (err, answer) => {
                    res.header = Object.assign({},answer.header,{id:res.header.id})
                    res.question = answer.question
                    res.answer = answer.answer
                    res.authority = answer.authority
                    res.additional = answer.additional
                    res.edns_options = answer.edns_options
                    res.payload = answer.payload
                    res._socket.base_size = 4096

                    res.authority.forEach(authority=>{
                        // because of node_modules/native-dnssec-dns-packet/packet.js line 425 buff.writeUInt32BE
                        if(authority.serial>2147483647) {
                            authority.serial = 999
                        }
                    })
                    console.log(`DNS: answer after ${new Date().getTime() - startTime}ms`, answer.answer.map(a=>a.address || a.name).join(' '))


                    /*if(answer.authority.length>0){
                        console.log('DNS: authority', answer.authority.map(a=>a.name).join(' '))
                    }
                    if(answer.additional.length>0){
                        console.log('DNS: additional', answer.additional.map(a=>a.name).join(' '))
                    }*/
                })

                dnsRequest.on('end', () => {
                    try {
                        res.send()

                        //req._socket.close()
                    }catch (e){
                        console.log(e)
                    }
                })
                dnsRequest.send()
            }
            dbBuffer[hostname] = {
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
            }

            if( Object.keys(dbBuffer).length > 20) {
                insertBuffer()
            }
        })

        server.on('error', (err, buff, req, res) => {
            console.log(`DNS: error`,err.stack)
        })

        server.on('socketError', (err) => {
            console.log(`DNS: socketError`,err)
        })


        server.on('listening', () => {
            console.log('DNS: listening')
        })

        server.on('close', () => {
            console.log('DNS: close')
        })
        server.on('socketError', (e) => {
            console.log('DNS: socketError',e)
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
        console.log('DNS: insert buffer')

        await database.collection('DnsHost').bulkWrite(Object.values(dbBuffer), { ordered: false })
        dbBuffer = {}
    }
}

