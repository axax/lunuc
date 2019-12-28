import Hook from '../../util/hook'
import dns from 'native-dns'

import schemaGen from './gensrc/schema'
import resolverGen from './gensrc/resolver'
import {deepMergeToFirst} from 'util/deepMerge'
import resolver from "../cronjob/resolver";
import schema from "../cronjob/schema";

console.log('create dns server')
const server = dns.createServer()

let database = null
let hosts = {}


// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolverGen(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schemaGen)
})

// Hook when db is ready
Hook.on('appready', ({db}) => {
    database = db
    readHosts(db)
})

// Hook when the type CronJob has changed
Hook.on('typeUpdated_DnsHost', ({result}) => {
    if (result.name) {
        console.log(result)
        hosts[result.name] = result.block
    }
})


server.on('request', (req, res) => {

    const hostname = req.question[0].name

    if (database != null) {

        if (hosts[hostname] === undefined) {
            hosts[hostname] = false
            database.collection('DnsHost').insertOne({
                name: hostname
            })
        }

    }

    if(hosts[hostname] === true){
        console.log(`block host ${hostname}`)
        res.answer.push(dns.A({
            name: hostname,
            address: '0.0.0.0',
            ttl: 1,
        }))
        res.send()
    }else {

        console.log(`resolve host ${hostname}`)
        const dnsRequest = dns.Request({
            question: req.question[0],
            server: {address: '8.8.8.8', port: 53, type: 'udp'},
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
})

server.on('error', (err, buff, req, res) => {
    console.log(err.stack)
})


server.on('listening', ()=> {
    console.log('dns listening')
})

server.on('listening', ()=> {
    console.log('dns close')
})

server.serve(3053, '*')


const readHosts = async (db) => {
    (await db.collection('DnsHost').find().forEach(o => {
        hosts[o.name] = !!o.block
    }))
}
