import bcrypt from 'bcrypt'


const PASSWORD_MIN_LENGTH = 5


const Util = {
	hashPassword: (pw) => {
		return bcrypt.hashSync(pw, bcrypt.genSaltSync(10))
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
	}
}


export default Util
