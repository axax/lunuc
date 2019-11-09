import http from 'http'
import net from 'net'
import {getHostFromHeaders} from 'util/host'

const server = http.createServer((req, client_res) => {
    console.log('serve: ' + req.url)
    var options = {
        hostname:getHostFromHeaders(req.headers),
        port: 80,
        path: req.url,
        method: req.method,
        headers: req.headers
    }

    var proxy = http.request(options, function (res) {
        //console.log(res)
        client_res.writeHead(res.statusCode, res.headers)
        res.pipe(client_res, {
            end: true
        })
    })

    req.pipe(proxy, {
        end: true
    })
})

console.log('Proxy is now running on port 3011')
server.listen(3011)


server.addListener('connect', function (req, socket, bodyhead) {
    var hostPort = getHostPortFromString(req.url, 443);
    var hostDomain = hostPort[0];
    var port = parseInt(hostPort[1]);
    console.log("Proxying HTTPS request for:", hostDomain, port);

    var proxySocket = new net.Socket();
    proxySocket.connect(port, hostDomain, function () {
            proxySocket.write(bodyhead);
            socket.write("HTTP/" + req.httpVersion + " 200 Connection established\r\n\r\n");
        }
    );

    proxySocket.on('data', function (chunk) {
        socket.write(chunk);
    });

    proxySocket.on('end', function () {
        socket.end();
    });

    proxySocket.on('error', function () {
        socket.write("HTTP/" + req.httpVersion + " 500 Connection error\r\n\r\n");
        socket.end();
    });

    socket.on('data', function (chunk) {
        proxySocket.write(chunk);
    });

    socket.on('end', function () {
        proxySocket.end();
    });

    socket.on('error', function () {
        proxySocket.end();
    });

});



var regex_hostport = /^([^:]+)(:([0-9]+))?$/;

var getHostPortFromString = function (hostString, defaultPort) {
    var host = hostString;
    var port = defaultPort;

    var result = regex_hostport.exec(hostString);
    if (result != null) {
        host = result[1];
        if (result[2] != null) {
            port = result[3];
        }
    }

    return ( [host, port] );
};
