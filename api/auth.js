import passport from 'passport'
import LocalStrategy from 'passport-local'


export const auth = (app, db) => {


	function loggingMiddleware(req, res, next) {
		console.log('ip:', req.ip)
		next()
	}
	app.use(loggingMiddleware)



	app.use(passport.initialize())
	app.use(passport.session())

	passport.serializeUser(function(user, done) {
		console.log('store user id to session', user)
		done(null, user.id)
	})

	passport.deserializeUser(function(id, done) {
		console.log('find user', id)
		return db.collection('User').findOne({id: id},function(err, user) {
			done(err, user)
		})
	})
	


	passport.use('local', new LocalStrategy(
		(user, password, done) => {

			// 1. check pw
			let isValid = true

			console.log(user, password)

			return done(null, 'admin')

		}
	))


	//login route for passport
	//app.use(bodyParser.urlencoded({extended: true}))
	app.post('/login', passport.authenticate('local', {
		successRedirect: '/',
		failureRedirect: '/login',
		failureFlash: true
	}))

}
