import net from 'net'
import Hook from '../../util/hook.cjs'
import Util from '../../api/util/index.mjs'
import {deepMergeToFirst} from '../../util/deepMerge.mjs'
import resolverGen from './gensrc/resolver.mjs'
import schemaGen from './gensrc/schema.mjs'
import config from '../../gensrc/config.mjs'
import {
    hasTooManyInvalidLoginAttempts,
    addInvalidLoginAttempt,
    clearInvalidLoginAttempt
} from '../../api/util/loginBlocker.mjs'

const DEFAULT_PORT = 3011

const startProxyServer = (db, port = DEFAULT_PORT)=> {
    const server = net.createServer()

    const checkAuth = async (headers, ip) => {
        const credentials = headers['proxy-authorization']
        const encoded = credentials && credentials.startsWith('Basic ') ? credentials.substring(6).trim() : ''
        if (!encoded) {
            return false
        }
        // too many failed logins from this ip: refuse without the (expensive) bcrypt check
        const blockKey = ip + ':proxy'
        if (hasTooManyInvalidLoginAttempts(blockKey)) {
            return false
        }

        const decoded = Buffer.from(encoded, 'base64').toString()
        const separator = decoded.indexOf(':')
        const user = separator >= 0 ? decoded.substring(0, separator) : decoded
        const pass = separator >= 0 ? decoded.substring(separator + 1) : ''

        const proxyUser = user && pass ? await db.collection('ProxyUser').findOne({active: true, username: user}) : null
        if (proxyUser && await Util.compareWithHashedPasswordAsync(pass, proxyUser.password)) {
            clearInvalidLoginAttempt(blockKey)
            return true
        }
        addInvalidLoginAttempt(blockKey)
        return false
    }

    server.on("connection", (clientToProxySocket) => {
        console.log('Client connected to proxy')

        // registered first: a client error must never become an unhandled 'error' event
        clientToProxySocket.on("error", (err) => {
            console.log("Client to proxy error", err.message)
        })

        clientToProxySocket.once("data", async (data) => {
          // everything in here comes from the client - an exception must not escape as
          // unhandled rejection (that would count towards the process exit in the log extension)
          try {
            const [firstLine, ...otherLines] = data.toString().split('\n')
            const [method, path, httpVersion] = firstLine.trim().split(' ')
            const headers = Object.fromEntries(otherLines.filter(_ => _)
                .map(line => line.split(':').map(part => part.trim()))
                .map(([name, ...rest]) => [name.toLowerCase(), rest.join(' ')]));


            if (!await checkAuth(headers, clientToProxySocket.remoteAddress)) {
                console.log('Proxy Server: 401 Access denied')
                clientToProxySocket.write("HTTP/1.1 401 Access denied\r\n\r\n")
                clientToProxySocket.end()
            } else {


                const isTLSConnection = method === 'CONNECT'

                let serverPort = 80
                let serverAddress
                if (isTLSConnection) {
                    serverPort = 443;
                    serverAddress = data
                        .toString()
                        .split("CONNECT")[1]
                        .split(" ")[1]
                        .split(":")[0];
                } else {
                    // header names are lowercased above; the port is not taken from the client
                    serverAddress = (headers['host'] || '').trim().split(/[\s:]/)[0]
                }
                if (!serverAddress) {
                    clientToProxySocket.write("HTTP/1.1 400 Bad Request\r\n\r\n")
                    clientToProxySocket.end()
                    return
                }

                // Creating a connection from proxy to destination server
                let proxyToServerSocket = net.createConnection(
                    {
                        host: serverAddress,
                        port: serverPort,
                    },
                    () => {
                        console.log("Proxy to server set up");
                    }
                );


                if (isTLSConnection) {
                    clientToProxySocket.write("HTTP/1.1 200 OK\r\n\r\n");
                } else {
                    proxyToServerSocket.write(data);
                }

                clientToProxySocket.pipe(proxyToServerSocket);
                proxyToServerSocket.pipe(clientToProxySocket);

                proxyToServerSocket.on("error", (err) => {
                    console.log("Proxy to server error");
                    console.log(err);
                })
            }


          } catch (e) {
            console.log('Proxy Server: invalid request', e.message)
            clientToProxySocket.destroy()
          }
        })
    })

    server.on("error", (err) => {
        console.log("Some internal server error occurred");
        console.log(err);
    });

    server.on("close", () => {
        console.log("Client disconnected");
    });

    server.listen(
        {
            host: "0.0.0.0",
            port: port,
        },
        () => {
            console.log(`Server listening on 0.0.0.0:${port}`)
        }
    )
}

// Hook when db is ready
Hook.on('appready', ({db}) => {
    if(config.PROXY_PORTS) {
        for (const port of config.PROXY_PORTS) {
            startProxyServer(db, port)
        }
    }else{
        startProxyServer(db)
    }
})


// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolverGen(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schemaGen)
})