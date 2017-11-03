import bcrypt from 'bcrypt'
import {ObjectId} from 'mongodb'


const PASSWORD_MIN_LENGTH = 5


const Util = {
    hashPassword: (pw) => {
        return bcrypt.hashSync(pw, bcrypt.genSaltSync(10))
    },
    compareWithHashedPassword: (pw, hashedPw) => {
        return bcrypt.hashSync(pw, hashedPw) === hashedPw
    },
    validatePassword: (pw) => {
        var err = []

        if (pw.length < PASSWORD_MIN_LENGTH) {
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
    },
    checkIfUserHasCapability: async (db, context, capability) => {
        const hasCapability = await Util.userHasCapability(db, context, capability)
        if (!hasCapability) {
            throw new Error(`User has not given premission for this operation. Missing capability "${capability}"`)
        }
    },
    userHasCapability: async (db, context, capability) => {
        if (context && context.id) {
            // TODO: Cache implementation
            const user = (await db.collection('User').findOne({_id: ObjectId(context.id)}))
            if (user.role) {
                const userRole = (await db.collection('UserRole').findOne({_id: ObjectId(user.role)}))
                return userRole.capabilities.includes(capability)
            }

        }
        return false
    },
    draftjsRawToFields: (body) => {
        if (!body || body === '')
            return {}

        let bodyJson
        try {
            bodyJson = JSON.parse(body)
        } catch (e) {
            return {}
        }

        const collection = {}
        for (let {type, text, inlineStyleRanges} of bodyJson.blocks) {

            if (text.trim() === '')
                continue

            type = type.replace(/-([a-z])/g, function (g) {
                return g[1].toUpperCase()
            })
            if (collection[type]) {
                collection[type] += ' '
            } else {
                collection[type] = ''
            }
            collection[type] += text.trim()
            for (let {style, offset, length} of inlineStyleRanges) {
                const name = ('style-' + style.toLowerCase()).replace(/-([a-z])/g, function (g) {
                    return g[1].toUpperCase()
                })

                if (collection[name]) {
                    collection[name] += ' '
                } else {
                    collection[name] = ''
                }

                collection[name] += text.substr(offset, length).trim()
            }
        }


        return collection
    }
}
export default Util