import express from 'express'
import path from 'path'

// Port to listen to
const port = (process.env.PORT || 8080)

// Build dir
var build_dir = path.join(__dirname, 'build')


// Initialize http api
const app = express()


//Serving the files on the dist folder
app.use(express.static(build_dir))


//Send index.html when the user access the web
app.get('*', function (req, res) {
	res.sendFile(path.join(__dirname, 'index.html'))
})


// Launch the server
const server = app.listen(port, () => {
	const {address, port} = server.address()

	console.log(`Listening at http://${address}:${port}`)
})
