import bcrypt from 'bcrypt-nodejs'
import {ObjectId} from 'mongodb'
import path from 'path'
import fs from 'fs'
import Cache from 'util/cache'
import * as os from 'os'
import {
    CAPABILITY_MANAGE_KEYVALUES
} from 'util/capabilities'

const PASSWORD_MIN_LENGTH = 5

/**
 * Object with general server side helper methods
 */

const Util = {
    userOrAnonymousId: async (db, context) => {
        if (!context || !context.id) {
            const anonymousContext = await Util.anonymousUserContext(db)
            return ObjectId(anonymousContext.id)
        } else {
            return ObjectId(context.id)
        }
    },
    userOrAnonymousContext: async (db, context) => {
        if (!context || !context.id) {
            const anonymousContext = await Util.anonymousUserContext(db)
            return anonymousContext
        } else {
            return context
        }
    },
    anonymousUserContext: async (db) => {
        // use anonymouse user
        const anonymousUser = await Util.userByName(db, 'anonymous')
        return {username: anonymousUser.username, id: anonymousUser._id.toString()}
    },
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
    setKeyValueGlobal: async (db, context, key, value, options) => {
        let newContext, newOption
        if (options) {
            newOption = options
        } else {
            newOption = {}
        }

        if ((newOption.skipCheck) || Util.userHasCapability(db, context, CAPABILITY_MANAGE_KEYVALUES)) {
            Cache.remove('KeyValueGlobal_' + key)

            return db.collection('KeyValueGlobal').updateOne({
                key
            }, {$set: {createdBy: await Util.userOrAnonymousId(db, context), key, value, ispublic: !!newOption.ispublic}}, {upsert: true})
        }
    },
    getKeyValueGlobal: async (db, context, key) => {
        const map = await Util.keyValueGlobalMap(db, context, [key])
        return map[key]
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
    keyValueGlobalMap: async (db, context, keys, nocache) => {

        // check if all keys are in the cache
        if (!nocache) {
            let map = {}
            for (const k of keys) {
                const fromCache = Cache.get('KeyValueGlobal_' + k)
                if (fromCache) {
                    map[k] = fromCache
                } else {
                    map = false
                    break
                }
            }
            if (map) {
                return map
            }
        }

        const keyvalues = (await db.collection('KeyValueGlobal').find({
            key: {$in: keys}
        }).toArray())

        console.log('load KeyValueGlobal', keys)
        return keyvalues.reduce((map, obj) => {
            let v
            try {
                v = JSON.parse(obj.value)
            } catch (e) {
                v = obj.value
            }
            map[obj.key] = v
            if (!nocache) {
                Cache.set('KeyValueGlobal_' + obj.key, v)
            }
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
        return !!(context && context.username)
    },
    checkIfUserHasCapability: async (db, context, capability) => {
        const hasCapability = await Util.userHasCapability(db, context, capability)
        if (!hasCapability) {
            throw new Error(`User has not given premission for this operation. Missing capability "${capability}"`)
        }
    },
    userById: async (db, id) => {
        const cacheKeyUser = 'User' + id
        let user = Cache.get(cacheKeyUser)

        if (!user) {
            user = (await db.collection('User').findOne({_id: ObjectId(id)}))
            Cache.set(cacheKeyUser, user, 86400000) // cache expires in 1 day
        }

        return user
    },
    userByName: async (db, name) => {
        const cacheKeyUser = 'User' + name
        let user = Cache.get(cacheKeyUser)

        if (!user) {
            user = (await db.collection('User').findOne({username: name}))
            Cache.set(cacheKeyUser, user, 86400000) // cache expires in 1 day
        }

        return user
    },
    userHasCapability: async (db, context, capability) => {
        if (context && context.id) {

            const user = await Util.userById(db, context.id)
            if (user && user.role) {
                const cacheKeyUserRole = 'UserRole' + user.role
                let userRole = Cache.get(cacheKeyUserRole)

                if (!userRole) {
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
    },
    matchFilterExpression: (filter, data) => {
        let match = false
        const filters = filter.split(' ')
        for (let i = 0; i < filters.length; i++) {
            const filter = filters[i]
            const pos = filter.indexOf('=')
            if (pos >= 0) {
                const key = filter.substring(0, pos).trim()
                const value = filter.substring(pos + 1).trim()

                const re = new RegExp(value, 'i')

                if (re.test(data[key])) {
                    match = true
                } else {
                    match = false
                    break
                }
            }
        }
        return match
    },
    systemProperties: () => {
        return ['hostname', 'arch', 'homedir', 'freemem', 'loadavg', 'platform', 'release', 'tmpdir', 'totalmem', 'type', 'uptime'].reduce((a, key) => {
            a[key] = os[key]()
            return a
        }, {})
    },
    sleep: (time) => {
        return new Promise((resolve) => setTimeout(resolve, time))
    }
}

export default Util
