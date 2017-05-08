import bcrypt from 'bcrypt'


const PASSWORD_MIN_LENGTH = 5


const Util = {
	hashPassword: (pw) => {
		return bcrypt.hashSync(pw, bcrypt.genSaltSync(10))
	},
	compareWithHashedPassword: (pw, hashedPw) => {
		return bcrypt.hashSync(pw, hashedPw)===hashedPw
	},
	validatePassword: (pw) => {
		var err = []

		if( pw.length < PASSWORD_MIN_LENGTH ){
			err.push(`Password is to short. Min length is ${PASSWORD_MIN_LENGTH}`)
		}

		return err
	},
	validateEmail: (email) => {
		var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
		return re.test(email)
	},
	checkIfUserIsLoggedIn: (context) => {

		if (!context || !context.username) {
			throw new Error('User is not logged in (or authenticated).')
		}
	}
}
export default Util