import bcrypt from 'bcrypt'
import {ObjectId} from 'mongodb'
import path from 'path'
import fs from 'fs'
import Cache from 'util/cache'


const PASSWORD_MIN_LENGTH = 5


const Util = {
    setKeyValues: async (db, context, keyvalues) => {
        for (var key in keyvalues) {
            if (keyvalues.hasOwnProperty(key)) {

                const res = (await Util.setKeyValue(db, context, key, keyvalues[key]))

                //console.log(res)
            }
        }

    },
    setKeyValue: async (db, context, key, value) => {
        if (Util.isUserLoggedIn(context)) {
            return db.collection('KeyValue').updateOne({
                createdBy: ObjectId(context.id),
                key
            }, {$set: {createdBy: ObjectId(context.id), key, value}}, {upsert: true})
        }
    },
    keyvalueMap: async (db, context, keys) => {
        if (!Util.isUserLoggedIn(context)) {
            // return empty map if no user is logged in
            return {}
        }

        const keyvalues = (await db.collection('KeyValue').find({
            createdBy: ObjectId(context.id),
            key: {$in: keys}
        }).toArray())

        return keyvalues.reduce((map, obj) => {
            map[obj.key] = obj.value
            return map
        }, {})

    },
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
    isUserLoggedIn: (context) => {
        return (context && context.username)
    },
    checkIfUserHasCapability: async (db, context, capability) => {
        const hasCapability = await Util.userHasCapability(db, context, capability)
        if (!hasCapability) {
            throw new Error(`User has not given premission for this operation. Missing capability "${capability}"`)
        }
    },
    userHasCapability: async (db, context, capability) => {
        if (context && context.id) {

            const cacheKeyUser = 'User' + context.id
            let user = Cache.get(cacheKeyUser)

            if( !user ){
                user = (await db.collection('User').findOne({_id: ObjectId(context.id)}))
                Cache.set(cacheKeyUser, user, 6000000) // cache expires in 100 min
            }

            if (user && user.role) {
                const cacheKeyUserRole = 'UserRole' + user.role
                let userRole = Cache.get(cacheKeyUserRole)

                if( !userRole ){
                    userRole = (await db.collection('UserRole').findOne({_id: ObjectId(user.role)}))
                    Cache.set(cacheKeyUserRole, userRole, 6000000) // cache expires in 100 min
                }

                return userRole.capabilities.includes(capability)
            }
        }
        return false
    },
    getUserRoles: async (db, id) => {
        // TODO: Add Cache for roles
        let userRole = (await db.collection('UserRole').findOne({_id: ObjectId(id)}))

        // fallback to default user role
        if (userRole === null) {
            userRole = (await db.collection('UserRole').findOne({name: 'subscriber'}))
        }
        return userRole
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
    },
    ensureDirectoryExistence: (dir) => {
        if (fs.existsSync(dir)) {
            return true
        }
        Util.ensureDirectoryExistence(path.dirname(dir))
        fs.mkdirSync(dir)
        return fs.existsSync(dir)
    }
}

export default Util