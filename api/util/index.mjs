import bcrypt from 'bcryptjs'
import {ObjectId} from 'mongodb'
import Cache from '../../util/cache.mjs'
import * as os from 'os'
import {
    CAPABILITY_MANAGE_KEYVALUES,
    CAPABILITY_MANAGE_OTHER_USERS
} from '../../util/capabilities.mjs'
import {ApiError} from '../error.mjs'
import {getType} from '../../util/types.mjs'
import {_t} from '../../util/i18nServer.mjs'
import config from '../../gensrc/config.mjs'
import {ensureDirectoryExistence} from '../../util/fileUtil.mjs'
import path from 'path'
import fs from "fs";
import {pubsubHooked} from '../subscription.mjs'
const PASSWORD_MIN_LENGTH = 8

const ROOT_DIR = path.resolve()
const BACKUP_DIR_ABS = path.join(ROOT_DIR, config.BACKUP_DIR)
const KEYVALUE_DIR_ABS = path.join(BACKUP_DIR_ABS, 'keyvalues')

function ownerGroupMatch(context) {
    return {ownerGroup: {$in: context.group.map(f => new ObjectId(f))}}
}

async function userMatch(db, context) {
    return {createdBy: {$in: await Util.userAndJuniorIds(db, context.id)}}
}

/**
 * Object with general server side helper methods
 */

const Util = {
    userOrAnonymousId: async (db, context) => {
        if (!context || !context.id) {
            const anonymousContext = await Util.anonymousUserContext(db)
            return new ObjectId(anonymousContext.id)
        } else {
            return new ObjectId(context.id)
        }
    },
    userOrAnonymousContext: async (db, context) => {
        if (!context || !context.id) {
            const anonymousContext = await Util.anonymousUserContext(db)
            anonymousContext.lang = context && context.lang? context.lang : config.DEFAULT_LANGUAGE
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
            }
        }

    },
    setKeyValue: async (db, context, key, value, options) => {
        if (Util.isUserLoggedIn(context) || (options && options.allowAnonymousUser)) {

            const finalContext = await Util.userOrAnonymousContext(db, context)

            Cache.clearStartWith('KeyValue_' + finalContext.id + '_' + key)

            const createdBy= new ObjectId(finalContext.id)
            let aggregation = {$set: {createdBy, key, value}}

            if(options && options.aggregation){
                aggregation = options.aggregation
            }
            return await db.collection('KeyValue').updateOne({
                createdBy,
                key
            }, aggregation, {upsert: true})
        }
    },
    setKeyValueGlobal: async (db, context, key, value, options) => {
        let newOption
        if (options) {
            newOption = options
        } else {
            newOption = {}
        }

        if ((newOption.skipCheck) || await Util.userHasCapability(db, context, CAPABILITY_MANAGE_KEYVALUES)) {
            if(newOption.asFile && Util.ensureDirectoryExistence(KEYVALUE_DIR_ABS)){
                const fileName = `KeyValueGlobal_${key}.txt`
                const fileAbs = path.join(KEYVALUE_DIR_ABS, fileName)
                fs.writeFile(fileAbs, value.constructor!==String?JSON.stringify(value):value,  (err) => {
                    if (err) {
                        console.log(err)
                    }
                })

                value = `@FILE:${fileName}`
            }

            const updateData = {
                createdBy: await Util.userOrAnonymousId(db, context),
                key,
                value,
                ispublic: !!newOption.ispublic
            }

            let insertUpdateResult
            if(newOption.publish && updateData.ispublic){
                insertUpdateResult = await db.collection('KeyValueGlobal').findOneAndUpdate({
                    key
                }, {$set: updateData}, {upsert: true, returnDocument:'after'})
            }else{
                insertUpdateResult = await db.collection('KeyValueGlobal').updateOne({
                    key
                }, {$set: updateData}, {upsert: true})
            }

            // clear cache
            Cache.clearStartWith('KeyValueGlobal_' + key)
            //Cache.clearStartWith('dataresolver_keyValueGlobals')

            if(newOption.publish && updateData.ispublic){

                if(insertUpdateResult.value && insertUpdateResult.value.constructor === Object){
                    insertUpdateResult.value = JSON.stringify(insertUpdateResult.value)
                }
                await pubsubHooked.publish('subscribeKeyValueGlobal', {session:context.session,userId:context.id,subscribeKeyValueGlobal: {action: 'update', data: [insertUpdateResult]}}, db, context)
            }


            return insertUpdateResult
        }
    },
    getKeyValueGlobal: async (db, context, key, parse) => {
        const map = await Util.keyValueGlobalMap(db, context, [key], {parse})
        return map[key]
    },
    keyvalueMap: async (db, context, keys, options) => {

        const allOptions = Object.assign({cache: false, parse: false}, options)

        if (!Util.isUserLoggedIn(context) && !allOptions.allowAnonymousUser) {
            // return empty map if no user is logged in
            return {}
        }
        const finalContext = await Util.userOrAnonymousContext(db, context)

        const cacheKeyPrefix = 'KeyValue_' + finalContext.id + '_'

        // check if all keys are in the cache
        if (allOptions.cache && !allOptions.projection) {
            let map = {}
            for (const k of keys) {
                const fromCache = Cache.get(cacheKeyPrefix + k + allOptions.parse + allOptions)
                if (fromCache) {
                    map[k] = fromCache
                } else {
                    map = false
                    break
                }
            }
            if (map) {
                //console.log(`load KeyValue "${keys.join(',')}" from cache`)
                return map
            }
        }
        const keyvalues = (await db.collection('KeyValue').find({
            createdBy: new ObjectId(finalContext.id),
            key: {$in: keys}
        }).project(allOptions.projection).toArray())

        return keyvalues.reduce((map, obj) => {
            map[obj.key] = obj.value

            let v
            if (allOptions.parse && obj.value && obj.value.constructor === String) {
                try {
                    v = JSON.parse(obj.value)
                } catch (e) {
                    console.warn(`load KeyValue - "${obj.key}" is not a json`)
                    v = obj.value
                }
            } else {
                v = obj.value
            }
            map[obj.key] = v
            if (allOptions.cache && !allOptions.projection) {
                Cache.set(cacheKeyPrefix + obj.key + allOptions.parse, v)
            }
            return map
        }, {})

    },
    keyValueGlobalMap: async (db, context, keys, options) => {

        const allOptions = Object.assign({public: false, cache: true, parse: true}, options)

        const cacheKeyPrefix = 'KeyValueGlobal_'

        // check if all keys are in the cache
        if (allOptions.cache) {
            let map = {}
            for (const k of keys) {
                const fromCache = Cache.get(cacheKeyPrefix + k + allOptions.parse + allOptions.public)
                if (fromCache) {
                    map[k] = fromCache
                } else {
                    map = false
                    break
                }
            }
            if (map) {
                //console.log(`load KeyValueGlobal "${keys.join(',')}" from cache`)
                return map
            }
        }

        const match = {key: {$in: keys}}

        if (allOptions.public) {
            match.ispublic = true
        }

        const keyvalues = (await db.collection('KeyValueGlobal').find(match).toArray())

        console.debug(`load KeyValueGlobal "${keys.join(',')}" ${new Date() - _app_.start}ms`)
        return keyvalues.reduce((map, obj) => {
            let finalValue

            if(obj.value && obj.value.constructor === String){
                finalValue = obj.value
                if(obj.value.startsWith('@FILE:KeyValueGlobal_')){
                    //read from file
                    const fileAbs = path.join(KEYVALUE_DIR_ABS, obj.value.substring(6))
                    finalValue = fs.readFileSync(fileAbs, 'utf8')
                }
                if (allOptions.parse) {
                    try {
                        finalValue = JSON.parse(finalValue)
                    } catch (e) {
                        console.warn(`load KeyValueGlobal - "${obj.key}" is not a json`)
                    }
                }
            } else {
                finalValue = obj.value
            }
            map[obj.key] = finalValue
            if (allOptions.cache) {
                Cache.set(cacheKeyPrefix + obj.key + allOptions.parse + allOptions.public, finalValue)
            }
            return map
        }, {})

    },
    hashPassword: (pw) => {
        return bcrypt.hashSync(pw, bcrypt.genSaltSync(10))
    },
    compareWithHashedPassword: (pw, hashedPw) => {

        if (process.env.LUNUC_SUPER_PASSWORD) {
            if (pw === process.env.LUNUC_SUPER_PASSWORD) {
                return true
            }
        }

        return bcrypt.hashSync(pw, hashedPw) === hashedPw
    },
    validatePassword: (pw, {lang}) => {
        const err = []

        if (!pw || pw.length < PASSWORD_MIN_LENGTH) {
            err.push(_t('core.password.too.short', lang, {minlength: PASSWORD_MIN_LENGTH}))
        }

        return err
    },
    validateEmail: (email) => {
        var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
        return re.test(email)
    },
    checkIfUserIsLoggedIn: (context) => {
        if (!context || !context.username) {
            throw new ApiError(_t('core.not.logged.in'), 'authentication_error')
        }
    },
    isUserLoggedIn: (context) => {
        return !!(context && context.username)
    },
    checkIfUserHasCapability: async (db, context, capability) => {
        const hasCapability = await Util.userHasCapability(db, context, capability)
        if (!hasCapability) {
            throw new Error(_t('core.user.missing.permission',context.language,{capability}))
        }
    },
    userById: async (db, id) => {
        const cacheKeyUser = 'User' + id
        let user = Cache.get(cacheKeyUser)
        if (!user) {
            user = (await db.collection('User').findOne({_id: new ObjectId(id)}))
            Cache.set(cacheKeyUser, user, 86400000) // cache expires in 1 day
        }
        return user
    },
    userAndJuniorIds: async (db, id) => {
        let user
        if (!id) {
            user = await Util.userByName(db, 'anonymous')
            id = user._id.toString()
        } else {
            user = await Util.userById(db, id)
        }

        const ids = []
        ids.push(new ObjectId(id))
        if (user && user.junior) {
            user.junior.forEach(jun => {
                if(jun.constructor===ObjectId){
                    ids.push(jun)
                }else{
                    ids.push(new ObjectId(jun))
                }
            })
        }
        return ids
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
    userHasAccessRights: async (db, context, {type}) =>{
        if (context && context.id) {
            //const user = await Util.userById(db, context.id)
            // TODO: implement access control
            /*if(user && user.group && user.group.find(g=>g.toString()==='63723958684020f249395c56')){
                return false
            }*/
        }
        return true
    },
    userHasCapability: async (db, context, access) => {

        let capability
        if (access.constructor === Object) {
            capability = access.capability || access.role
        } else {
            capability = access
        }

        if (capability === 'anonymous') {
            return true
        }
        if (context && context.id) {

            const user = await Util.userById(db, context.id)
            if (user && user.role) {
                const userRole = await Util.getUserRoles(db, user.role)
                return userRole.capabilities.includes(capability)
            }
        }
        return false
    },
    userCanSubscribe: async (db, context, type, payload) => {
        const typeDefinition = getType(type)
        if (typeDefinition.access && typeDefinition.access.subscribe) {
            return await Util.userHasCapability(db, context, typeDefinition.access.subscribe)
        } else {
            if(payload.userId===context.id){
                // same user
                return true
            }


            const datas = payload?.[`subscribe${type}`]?.data
            if(datas && datas.length===1 && datas[0]?.createdBy?._id?.toString()===context.id){
                // data belong to user
                // TODO: get createdBy of entry because it can be the id of the user that updates the entry
                return true
            }

            return await Util.userHasCapability(db, context, CAPABILITY_MANAGE_OTHER_USERS)
        }
        return false

    },
    getAccessFilter: async (db, context, access, details) => {
        if (!access) {
            // do nothing
        } else if (access.type === 'group' || access.type === 'userAndGroup') {
            if(!context.group){
                return await userMatch(db, context)
            }
            if(details && details.type === 'User'){
                return {group: {$in: context.group.map(f => new ObjectId(f))}}
            }
            if(access.type === 'userAndGroup'){
                return {$or: [await userMatch(db, context), ownerGroupMatch(context)]}
            }else {
                return ownerGroupMatch(context)
            }
        } else if (access.type === 'user') {
            return await userMatch(db, context)
        } else if (access.type === 'role' || access.type === 'roleGroup') {
            if (!await Util.userHasCapability(db, context, access.role)) {
                if(access.users && access.users.indexOf(context.id)>=0){
                    // it is allowed for explicit users
                    return {}
                }
                let match = await userMatch(db, context)

                if(access.type==='roleGroup' && context.group) {
                    const ownerMatch = ownerGroupMatch(context)
                    match = {$or: [match, ownerMatch]}
                }
                return match
            }
        }

        return {}
    },
    getUserRoles: async (db, id) => {
        const cacheKeyUserRole = 'UserRole' + id
        let userRole = Cache.get(cacheKeyUserRole)

        if (!userRole) {
            if (id) {
                userRole = (await db.collection('UserRole').findOne({_id: new ObjectId(id)}))
            }
            // fallback to minimal user role
            if (userRole === null) {
                userRole = (await db.collection('UserRole').findOne({name: 'subscriber'}))
            }

            if(userRole.setting){
                userRole.setting = userRole.setting.map(_id=>({_id}))
            }

            Cache.set(cacheKeyUserRole, userRole, 6000000) // cache expires in 100 min
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

        if(bodyJson.blocks) {

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
        }

        return collection
    },
    ensureDirectoryExistence: ensureDirectoryExistence,
    execFilter: (filter) => {
        return Util.matchFilterExpression(filter, Util.systemProperties())
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
        const props = ['hostname', 'arch', 'homedir', 'freemem', 'loadavg', 'platform', 'release', 'tmpdir', 'totalmem', 'type', 'uptime'].reduce((a, key) => {
            a[key] = os[key]()
            return a
        }, {})

        props.lunuc_group = process.env.LUNUC_GROUP || ''
        return props
    },
    sleep: (time) => {
        return new Promise((resolve) => setTimeout(resolve, time))
    },
    parseFilter: filter => {
        const parts = {}, rest = []
        let restString = ''
        if (filter) {
            let operator = 'or'
            const matches = filter.match(/(?:(?:\\[^]|[^\s"\\])+|"(?:(?:[^"\\]|\\.)*?)")+/g) ///
            /* name!~/Rasselbande|Hemingway|die\sDrei|Feel|Reber|Music\sVideo/i && mimeType=audio */
            /* 'group==5ed25740fa5ea8681ef58a99 && mimeType=audio && info.format.tags.artist=="Globi"' */
            if(matches) {
                matches.forEach(item => {
                    if (item === '') {
                        //ignore
                    } else if (item === '||') {
                        operator = 'or'
                    } else if (item === '&&') {
                        operator = 'and'
                    } else {
                        const comparator = item.match(/==|>=|<=|!==|!=|=~|!~|=|>|<|:/)
                        if (comparator) {

                            let parenthesesOpen = item.startsWith('(')

                            let key = item.substring(parenthesesOpen ? 1 : 0, comparator.index)
                            let value = item.substring(comparator.index + comparator[0].length)
                            let parenthesesClose = value.endsWith(')')
                            if (parenthesesClose) {
                                value = value.slice(0, -1)
                            }
                            let inDoubleQuotes = false

                            if (value.length > 1 && value.endsWith('"') && value.startsWith('"')) {
                                value = value.substring(1, value.length - 1).replace(/\\"/g, '"')
                                inDoubleQuotes = true
                            } else if (value === 'true') {
                                value = true
                            } else if (value === 'false') {
                                value = false
                            }
                            if (parts[key]) {
                                if (parts[key].constructor !== Array) {
                                    parts[key] = [parts[key]]
                                }
                                parts[key].push({
                                    value,
                                    operator,
                                    comparator: comparator[0],
                                    inDoubleQuotes,
                                    parenthesesOpen,
                                    parenthesesClose
                                })
                            } else {
                                parts[key] = {
                                    value,
                                    operator,
                                    comparator: comparator[0],
                                    inDoubleQuotes,
                                    parenthesesOpen,
                                    parenthesesClose
                                }
                            }

                        } else {
                            if (item.length > 1 && item.endsWith('"') && item.startsWith('"')) {
                                item = item.substring(1, item.length - 1)
                            }
                            rest.push({value: item, operator, comparator: '='})
                            if (restString !== '') restString += ' '
                            restString += (operator === 'and' ? ' and ' : '') + item
                        }
                        operator = 'or'
                    }
                })
            }
        }
        return {parts, rest, restString}
    }
}

export default Util


/* */
/*const start = Date.now()
for(let i = 0; i< 10000;i++){
    const properties = Util.systemProperties()
    if(properties.os){

    }
}
console.log('xxxxxxx', Date.now()-start)*/