import dns2 from 'dns2'
import Hook from '../../util/hook.cjs'
import schemaGen from './gensrc/schema'
import resolverGen from './gensrc/resolver'
import {deepMergeToFirst} from 'util/deepMerge.mjs'
import Util from '../../api/util/index.mjs'
import {parseOrElse} from '../../client/util/json.mjs'
import {getGatewayIp} from '../../util/gatewayIp.mjs'

dns2.Packet.TYPE['HTTPS'] = 65
const dnsServerContext = {
    server: false,
    database: false,
    hosts: {},
    hostsGroup: {},
    dbBuffer: {},
    settings: {},
    typeMap: Object.keys(dns2.Packet.TYPE).reduce((a, k) => {
        a[dns2.Packet.TYPE[k]] = k;
        return a
    }, {})
}


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

    dnsServerContext.settings = (await Util.getKeyValueGlobal(db, context, 'DnsSettings', true)) || {}

    if (!dnsServerContext.settings.execfilter || Util.execFilter(dnsServerContext.settings.execfilter)) {

        // refresh settings every minute
        setInterval(async () => {
            dnsServerContext.settings = (await Util.getKeyValueGlobal(db, context, 'DnsSettings', true)) || {}

            Object.keys(dnsServerContext.hostsGroup).forEach(key => {
                const hostGroup = dnsServerContext.hostsGroup[key]

                if (!hostGroup.block && hostGroup.blockRule) {

                    const tpl = new Function(hostGroup.blockRule)
                    hostGroup._block = tpl.call({})

                } else {
                    hostGroup._block = false
                }

            })


        }, 1000 * 60)

        dnsServerContext.database = db
        await readHosts(db)


        console.log('DNS: create dns server')

        dnsServerContext.server = dns2.createServer({
            udp: true,
            handle: async (request, send, rinfo) => {
                const response = dns2.Packet.createResponseFromRequest(request)
                const [question] = request.questions

                if (question) {
                    const {name} = question
                    const startTime = new Date().getTime()

                    if (dnsServerContext.hosts[name] === undefined) {
                        dnsServerContext.hosts[name] = {block: false, subdomains: false}
                    }

                    if (!dnsServerContext.hosts[name].count) {
                        dnsServerContext.hosts[name].count = 0
                    }
                    dnsServerContext.hosts[name].count++

                    const hostBlocked = isHostBlocked(name)

                    if (hostBlocked && !dnsServerContext.settings.disabled) {
                        debugMessage(`DNS: block ${name}`)

                        response.answers.push({
                            name,
                            type: question.type,
                            class: question.class,
                            ttl: 300,
                            address: '0.0.0.0'
                        })
                        send(response)

                    } else {
                        const localResponse = dnsServerContext.hosts[name].response
                        if (localResponse?.answers?.length > 0) {
                            response.header = Object.assign({}, localResponse.header, {id: response.header.id})
                            response.authorities = localResponse.authorities || []
                            response.answers = localResponse.answers
                            response.additionals = localResponse.additionals || []
                        } else {
                            const resolvedQuestion = await resolveDnsQuestion(question)
                            response.header = Object.assign({}, resolvedQuestion.header, {id: response.header.id})
                            response.authorities = resolvedQuestion.authorities
                            response.answers = resolvedQuestion.answers
                            response.additionals = resolvedQuestion.additionals

                            if (response?.answers?.length > 0) {
                                response.answers.forEach(answer => {
                                    if (answer.address == dnsServerContext.gatewayIp && rinfo.address=="127.0.0.1") {
                                        answer.address = '127.0.0.1'
                                    }
                                })
                            }
                        }
                        try {
                            send(response)
                        } catch (e) {
                            console.log(e, response)
                        }
                        debugMessage(`DNS: resolved ${name} after ${new Date().getTime() - startTime}ms`, response)
                    }

                    dnsServerContext.dbBuffer[name] = {
                        updateOne: {
                            filter: {name},
                            update: {
                                $set: {
                                    lastIp: rinfo.address,
                                    lastUsed: new Date().getTime(),
                                    name,
                                    count: dnsServerContext.hosts[name].count
                                }
                            },
                            upsert: true
                        }
                    }

                    if (Object.keys(dnsServerContext.dbBuffer).length > 20) {
                        await insertBuffer()
                    }
                } else {
                    send(response)
                }
            }
        })


        dnsServerContext.server.on('request', (request, response, rinfo) => {
            //debugMessage(`DNS: request`, request.header.id, request.questions[0])
        })

        dnsServerContext.server.on('requestError', (error) => {
            console.log('DNS: Client sent an invalid request', error)
        })

        dnsServerContext.server.on('listening', async () => {
            console.log('DNS: listening', dnsServerContext.server.addresses())
            dnsServerContext.gatewayIp = await getGatewayIp(true)
            Hook.call('dnsready', {db,context})
        })

        dnsServerContext.server.on('close', () => {
            console.log('DNS: server closed')
        })

        dnsServerContext.server.listen({
            // Optionally specify port, address and/or the family of socket() for udp server:
            udp: {
                port: 53,
                address: '0.0.0.0',
                type: 'udp4',  // IPv4 or IPv6 (Must be either "udp4" or "udp6")
            },
            // Optionally specify port and/or address for tcp server:
            /* tcp: {
                 port: 53,
                 address: "0.0.0.0",
             },*/
        })

        // eventually
        // server.close();
    }else{
        Hook.call('dnsready', {db,context})
    }
})

// Hook when the type CronJob has changed
Hook.on('typeUpdated_DnsHost', ({result}) => {
    if (result.name && dnsServerContext.hosts[result.name]) {

        dnsServerContext.hosts[result.name].group = result.group

        dnsServerContext.hosts[result.name].response = parseOrElse(result.response)

        if (result.block !== undefined) {
            dnsServerContext.hosts[result.name].block = result.block
        }
        if (result.subdomains !== undefined) {
            dnsServerContext.hosts[result.name].subdomains = result.subdomains
        }
    }
})
Hook.on(['typeUpdated_DnsHostGroup', 'typeCreated_DnsHostGroup'], ({result}) => {
    const id = result._id.toString()
    if (!dnsServerContext.hostsGroup[id]) {
        dnsServerContext.hostsGroup[id] = result
    }
    dnsServerContext.hostsGroup[id].block = result.block
    dnsServerContext.hostsGroup[id].blockRule = result.blockRule ? result.blockRule.trim() : ''
})

Hook.on('appexit', async () => {
    await insertBuffer()
})

const debugMessage = (msg, details) => {
    if (dnsServerContext.settings.debug) {
        console.debug(msg, details)
    }
}

let dnsResolvers = {}
const resolveDnsQuestion = async (question) => {
    const dnsServer = dnsServerContext.settings.dns || '8.8.8.8'
    if(!dnsResolvers[dnsServer]) {
        dnsResolvers[dnsServer] = new dns2({
            dns: dnsServer,
            recursive:false
        })
    }
    const typeName = dnsServerContext.typeMap[question.type]
    debugMessage(`resolve dns type ${typeName} for question`, question)

    const result = await dnsResolvers[dnsServer].resolve(question.name, typeName, question.class)
    return result
}

const readHosts = async (db) => {
    await db.collection('DnsHost').find().forEach(o => {
        dnsServerContext.hosts[o.name] = {
            block: o.block,
            subdomains: o.subdomains,
            count: o.count,
            response: o.response,
            group: o.group
        }
    })

    await db.collection('DnsHostGroup').find().forEach(o => {
        dnsServerContext.hostsGroup[o._id.toString()] = {
            block: o.block,
            blockRule: o.blockRule ? o.blockRule.trim() : ''
        }
    })
}


const isHostGroupBlocked = (hostname) => {
    let block = false
    const groups = dnsServerContext.hosts[hostname].group || []
    for (const group of groups) {
        const hostGroup = dnsServerContext.hostsGroup[group.toString()]
        if (hostGroup && (hostGroup.block || hostGroup._block)) {
            block = true
            break
        }
    }
    return block
}

const isHostBlocked = (hostname) => {
    let block = dnsServerContext.hosts[hostname].block === true

    if (!block) {
        // check group blocking
        block = isHostGroupBlocked(hostname)
    }

    if (!block) {
        //check subdomains
        let subHostname = hostname
        let pos = subHostname.indexOf('.')
        while (pos >= 0) {
            subHostname = subHostname.substring(pos + 1)
            if (dnsServerContext.hosts[subHostname] && dnsServerContext.hosts[subHostname].subdomains === true) {

                if (dnsServerContext.hosts[subHostname].block === true) {
                    block = true
                    break
                } else {
                    block = isHostGroupBlocked(subHostname)
                    if (block) {
                        break
                    }
                }
            }
            pos = subHostname.indexOf('.')
        }
    }
    return block
}

const insertBuffer = async () => {
    if (dnsServerContext.database) {
        await dnsServerContext.database.collection('DnsHost').bulkWrite(Object.values(dnsServerContext.dbBuffer), {ordered: false})
        dnsServerContext.dbBuffer = {}
    }
}

