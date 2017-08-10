import express from 'express'
import path from 'path'
import proxy from 'express-http-proxy'

// Port to listen to
const PORT = (process.env.PORT || 8080)
const API_PORT = (process.env.API_PORT || 3000)

// Build dir
var build_dir = path.join(__dirname, '../build')


// Initialize http api
const app = express()


//Serving the files on the dist folder
app.use(express.static(build_dir))

// Proxy for API
app.use('/graphql', proxy(`localhost:${API_PORT}`, {
	proxyReqPathResolver: function(req) {
		return '/graphql'+require('url').parse(req.url).path
	}
}))

//Send index.html when the user access the web
app.get('/graphql', function (req, res) {
	console.log('graphql',req)
})


//Send index.html when the user access the web
app.get('*', function (req, res) {
	res.sendFile(path.join(build_dir, '/../index.html'))
})

// Launch the server
const server = app.listen(PORT, () => {
	const {address, port} = server.address()

	console.log(`Listening at http://${address}:${port}`)
})

// proxy for websocket
/*app.use('/ws', proxy(`localhost:${API_PORT}`, {
	proxyReqPathResolver: function(req) {
		console.log(req)
		return require('url').parse(req.url).path
	}
}))*/
/*app.on('upgrade', function (req, socket, head) {
	console.log(head)

	proxy.ws(req, socket, head)
})*/
