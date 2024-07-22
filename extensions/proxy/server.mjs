import net from 'net'
import Hook from '../../util/hook.cjs'
import Util from '../../api/util/index.mjs'
import {deepMergeToFirst} from '../../util/deepMerge.mjs'
import resolverGen from './gensrc/resolver.mjs'
import schemaGen from './gensrc/schema.mjs'
import config from '../../gensrc/config.mjs'

const DEFAULT_PORT = 3011

const startProxyServer = (db, port = DEFAULT_PORT)=> {
    const server = net.createServer()

    const checkAuth = async (headers) => {
        const credentials = headers['proxy-authorization']
        if (!credentials || !credentials.startsWith('Basic')) {
            return false
        }

        const auth = new Buffer.from(credentials.split(' ')[1],
            'base64').toString().split(':')
        const user = auth[0]
        const pass = auth[1]

        const proxyUser = await db.collection('ProxyUser').findOne({active:true,username: user})
        if(proxyUser){
            if (Util.compareWithHashedPassword(pass, proxyUser.password)) {
                return true
            }
        }
        return false
    }

    server.on("connection", (clientToProxySocket) => {
        console.log('Client connected to proxy')

        clientToProxySocket.once("data", async (data) => {
            const [firstLine, ...otherLines] = data.toString().split('\n')
            const [method, path, httpVersion] = firstLine.trim().split(' ')
            const headers = Object.fromEntries(otherLines.filter(_ => _)
                .map(line => line.split(':').map(part => part.trim()))
                .map(([name, ...rest]) => [name.toLowerCase(), rest.join(' ')]));


            if (!await checkAuth(headers)) {
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
                    serverAddress = data.toString().split("Host: ")[1].split("\r\n")[0];
                }
                console.log(serverAddress);

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


            clientToProxySocket.on("error", (err) => {
                console.log("Client to proxy error");
                console.log(err)
            })
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