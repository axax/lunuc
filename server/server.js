import httpProxy from 'http-proxy'
import http from 'http'
import url from 'url'
import path from 'path'
import fs from 'fs'
import zlib from 'zlib'

// Port to listen to
const PORT = (process.env.PORT || 8080)
const API_PORT = (process.env.API_PORT || 3000)


// Build dir
const build_dir = path.join(__dirname, '../build')

const mimeTypes = {
	'html': 'text/html',
	'jpeg': 'image/jpeg',
	'jpg': 'image/jpeg',
	'png': 'image/png',
	'ico': 'image/x-icon',
	'js': 'text/javascript',
	'css': 'text/css'
}


//
// Setup our server to proxy standard HTTP requests
//
const proxy = new httpProxy.createProxyServer()


//
// Listen for the `error` event on `proxy`.
proxy.on('error', function (err, req, res) {
	// error handling
	//console.log(err)
})

// Initialize http api
const app = http.createServer(function (req, res) {

		const uri = url.parse(req.url).pathname
		if (uri === '/graphql') {
			proxy.web(req, res, { target: `http://localhost:${API_PORT}/graphql`})
		} else {
			const filename = path.join(build_dir, uri),
				ext = path.extname(filename).split('.')[1]

            let acceptEncoding = req.headers['accept-encoding']
            if (!acceptEncoding) {
                acceptEncoding = ''
            }

			if( ext ) {


				fs.stat(filename, function (err, stats) {
					if (err) {
						console.log('not exists: ' + filename)
						res.writeHead(404, {'Content-Type': 'text/plain'})
						res.write('404 Not Found\n')
						res.end()
					} else {
						const mimeType = mimeTypes[path.extname(filename).split('.')[1]]
						const fileStream = fs.createReadStream(filename)

                        if (acceptEncoding.match(/\bdeflate\b/)) {
                            res.writeHead(200, {mimeType, 'content-encoding': 'deflate' });
                            fileStream.pipe(zlib.createDeflate()).pipe(res);
                        } else if (acceptEncoding.match(/\bgzip\b/)) {
                            res.writeHead(200, {mimeType, 'content-encoding': 'gzip' })
                            fileStream.pipe(zlib.createGzip()).pipe(res)
                        } else {
                            res.writeHead(200, mimeType)
                            fileStream.pipe(res)
                        }
					}
				})
			}else{
					// send index.html
				const indexfile = path.join(build_dir, '/../index.html')
				res.writeHead(200, mimeTypes['html'])

				const fileStream = fs.createReadStream(indexfile)
				fileStream.pipe(res)
			}
		}
	}
)


//
// Listen to the `upgrade` event and proxy the
// WebSocket requests as well.
//
app.on('upgrade', function (req, socket, head) {
	proxy.ws(req, socket, head, { target: `ws://localhost:${API_PORT}/ws`, ws: true})
})

app.listen(PORT, () => console.log(
	`Listening at http://localhost:${PORT}`
))