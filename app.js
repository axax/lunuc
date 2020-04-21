/*const exec = require('child_process').exec
const childApi = exec('npm run api')
const childServer = exec('npm run client')

childApi.stderr.pipe(process.stderr)
childApi.stdout.pipe(process.stdout)

childServer.stderr.pipe(process.stderr)
childServer.stdout.pipe(process.stdout)*/
require('./server')
