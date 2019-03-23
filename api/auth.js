import jwt from 'jsonwebtoken'
import bodyParser from 'body-parser'
import Util from './util'
import config from 'gen/config'

const {DEFAULT_LANGUAGE} = config

//TODO but SECRET_KEY to a save place
const AUTH_HEADER = 'authorization',
	CONTENT_LANGUAGE_HEADER = 'content-language',
	AUTH_SCHEME = 'JWT',
	SECRET_KEY = 'fa-+3452sdfas!ä$$34dää$',
	AUTH_EXPIRES_IN = '999y'


export const auth = {
	createToken: async (username, password, db) => {

		const userCollection = db.collection('User')

		const user = await userCollection.findOne({$or: [{'email': username}, {'username': username}]})

		if (!user) {
			return {error: 'no such user found', token: null, user:null}
		} else if (Util.compareWithHashedPassword(password, user.password)) {
            user.role = Util.getUserRoles(db,user.role)

            // from now on we'll identify the user by the id and the id is the only personalized value that goes into our token
			const payload = {'username': user.username, 'id': user._id}
			const token = jwt.sign(payload, SECRET_KEY, {expiresIn: AUTH_EXPIRES_IN})
			return {token: token, user}
		} else {
			return {error: 'password did not match', token: null, user: null}
		}
	},
	decodeToken: (token) => {
		let result = {}
        if (token) {

            const matches = token.match(/(\S+)\s+(\S+)/)

            if ( matches && matches.length > 1 && matches[1] === AUTH_SCHEME) {

                // verify a token symmetric - synchronous
                jwt.verify(matches[2], SECRET_KEY, (err, decoded) => {
                    if (!err) {
                         result = decoded
                    } else {
                        console.error(err)
                    }
                })
            }
        }
        return result
	},
	initialize: (app, db) => {




		app.use((req, res, next) => {
console.log(req.hostname, req.headers)
			const token = req.headers[AUTH_HEADER], lang = req.headers[CONTENT_LANGUAGE_HEADER]

            // now if auth is needed we can check if the context is available
            req.context = auth.decodeToken(token)

			// add the requested language to the context
			req.context.lang = lang || DEFAULT_LANGUAGE

			next()
		})


        // we do login via graphql for now
        // creates the body object on the request
        /*app.use(bodyParser.json())
		app.post('/login', async (req, res) => {
			const {username, password} = req.body

			const result = await auth.createToken(username,password,db)

			if( result.error ) {
				res.status(401).json(result)
			}else{
				res.json(result)
			}


		})*/

	}
}
