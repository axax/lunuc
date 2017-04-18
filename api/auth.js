import jwt from 'jsonwebtoken'
import bodyParser from 'body-parser'


const AUTH_HEADER = 'authorization',
	AUTH_SCHEME = 'JWT',
	SECRET_KEY = 'fa-+3452sdfas!ä$$34dää$'

// Fake user database
const fakeUsers = [
	{
		id: 1,
		username: 'user1',
		password: 'password'
	},
	{
		id: 2,
		username: 'user2',
		password: 'password'
	}
];


export const auth = {
	initialize: (app, db) => {


		// creates the body object on the request
		app.use(bodyParser.json())


		app.use((req, res, next) => {

			let token = req.headers[AUTH_HEADER]

			if (token) {

				let matches = token.match(/(\S+)\s+(\S+)/)

				if (matches[1] === AUTH_SCHEME) {

					// verify a token symmetric - synchronous
					jwt.verify(matches[2], SECRET_KEY, function (err, decoded) {
						if (!err) {

							// now if auth is needed we can check if the context is available
							req.context = decoded
						}
					})
				}
			}
			next()
		})


		app.post('/login', (req, res) => {
			const {username, password} = req.body

			// usually this would be a database call:
			const user = fakeUsers.find((x) => (x.username === username))

			if (!user) {
				res.status(401).json({message: 'no such user found'})
			} else if (user.password === password) {
				// from now on we'll identify the user by the id and the id is the only personalized value that goes into our token
				const payload = {userId: user.id}
				const token = jwt.sign(payload, SECRET_KEY, {expiresIn: '1h'})
				res.json({message: 'ok', token: token})
			} else {
				res.status(401).json({message: 'passwords did not match'})
			}
		})

	}
}
