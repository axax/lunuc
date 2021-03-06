import Util from '../util'
import {ObjectId} from 'mongodb'
import {auth} from '../auth'
import {ApiError, ValidationError} from '../error'
import GenericResolver from './generic/genericResolver'
import Cache from 'util/cache'
import {
    CAPABILITY_MANAGE_USER_ROLE,
    CAPABILITY_MANAGE_OTHER_USERS, CAPABILITY_MANAGE_COLLECTION
} from 'util/capabilities'
import {sendMail} from 'api/util/mail'
import crypto from 'crypto'
import {clientAddress} from '../../util/host'
import {setAuthCookies, removeAuthCookies} from 'api/util/sessionContext'
import {_t} from '../../util/i18nServer'
import Hook from '../../util/hook'
import {AUTH_EXPIRES_IN_COOKIE, USE_COOKIES, AUTH_SCHEME} from '../constants'

const LOGIN_ATTEMPTS_MAP = {},
    MAX_LOGIN_ATTEMPTS = 10,
    LOGIN_DELAY_IN_SEC = 180

const createUser = async ({username, role, junior, password, language, email, emailConfirmed, requestNewPassword, meta, picture, db, context}, opts) => {

    if (!opts) {
        opts = {override: false}
    }
    const errors = []

    // Validate Username
    if (username.trim() === '') {
        errors.push({key: 'usernameError', message: 'Username is missing'})
    }

    // Validate Password
    const err = Util.validatePassword(password, context)
    if (err.length > 0) {
        errors.push({key: 'passwordError', message: err.join('\n')})
    }

    // Validate Email Address
    if (!Util.validateEmail(email)) {
        errors.push({key: 'emailError', message: 'Email is not valid'})
    }

    if (errors.length > 0) {
        throw new ValidationError(errors)
    }

    const userCollection = db.collection('User')

    const existingUser = (await userCollection.findOne({$or: [{'email': email}, {'username': username}]}))
    const userExists = existingUser != null

    if (!opts.override) {

        if (userExists) {
            errors.push({key: 'usernameError', message: _t('core.signup.usertaken', context.lang)})
            throw new ValidationError(errors)
        }
    }

    if (meta !== undefined && meta !== null) {
        if(meta.constructor !== Object) {
            meta = JSON.parse(meta)
        }
    }


    const signupToken = crypto.randomBytes(16).toString("hex")
    const hashedPw = Util.hashPassword(password)

    let roleId
    if (role && await Util.userHasCapability(db, context, CAPABILITY_MANAGE_USER_ROLE)) {
        roleId = ObjectId(role)
    } else {
        const userRole = (await db.collection('UserRole').findOne({name: 'subscriber'}))
        roleId = userRole._id
    }
    const juniorIds = []
    if (junior && await Util.userHasCapability(db, context, CAPABILITY_MANAGE_USER_ROLE)) {
        junior.forEach(sup => {
            juniorIds.push(ObjectId(sup))
        })
    }

    const dataToInsert = {
        role: roleId,
        junior: juniorIds,
        emailConfirmed: !!emailConfirmed,
        requestNewPassword: !!requestNewPassword,
        email: email,
        username: username,
        password: hashedPw,
        picture,
        meta,
        language: language || context.lang,
        signupToken: signupToken
    }

    let insertResult
    if (!opts.override || !userExists) {
        insertResult = await userCollection.insertOne(dataToInsert)
    } else {
        insertResult = await userCollection.updateOne(
            {_id: existingUser._id},
            {
                $set: dataToInsert
            }
        )
        insertResult.ops = [dataToInsert]
    }
    Hook.call('NewUserCreated', {insertResult, meta, email, db})

    return insertResult

}


export const userResolver = (db) => ({
    Query: {
        users: async ({limit, page, offset, filter, sort}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)
            return await GenericResolver.entities(db, context, 'User', ['username', 'password', 'signupToken', 'language', 'picture', 'email', 'meta', 'emailConfirmed', 'requestNewPassword', 'role$UserRole', 'junior$[User]', 'lastLogin'], {
                limit,
                page,
                offset,
                filter,
                sort
            })
        },
        userRoles: async ({limit, page, offset, filter, sort}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)
            return await GenericResolver.entities(db, context, 'UserRole', ['name', 'capabilities'], {
                limit,
                page,
                offset,
                filter,
                sort
            })
        },
        me: async (data, {context}) => {
            Util.checkIfUserIsLoggedIn(context)
            const user = (await db.collection('User').findOne({_id: ObjectId(context.id)}))

            if (!user) {
                throw new Error('User doesn\'t exist')
            } else {
                user.role = Util.getUserRoles(db, user.role)

                if (user.picture) {
                    user.picture = {_id: user.picture}
                }

                if (user.meta) {
                    user.meta = JSON.stringify(user.meta)
                }
                /*if( user.picture){
                    user.picture = await db.collection('Media').findOne({_id: ObjectId(user.picture)})
                }*/
                //enhanceUserSettings(user)

            }
            return user
        },
        publicUsers: async ({limit, offset}, {context, query}) => {
            Util.checkIfUserIsLoggedIn(context)

            const userCollection = db.collection('User')


            let users = (await userCollection.aggregate([
                /*{
                 $match: {
                 users: {$in: [ObjectId(context.id)]}
                 }
                 },*/
                {
                    $skip: offset,
                },
                {
                    $limit: limit
                },
                {
                    $project: {
                        username: 1
                    }
                }

            ]).toArray())


            return users
        },
        login: async ({username, password}, req) => {
            const {context} = req
            const ip = clientAddress(req)

            if (LOGIN_ATTEMPTS_MAP[ip] && LOGIN_ATTEMPTS_MAP[ip].count >= MAX_LOGIN_ATTEMPTS) {
                const time = new Date().getTime()

                if (time - LOGIN_ATTEMPTS_MAP[ip].lasttry < LOGIN_DELAY_IN_SEC * 1000) {
                    return {error: _t('core.login.blocked', context.lang), token: null, user: null}
                } else {
                    delete LOGIN_ATTEMPTS_MAP[ip]
                }
            }

            const result = await auth.createToken(username, password, db, context)
            if (!result.token) {

                if (!LOGIN_ATTEMPTS_MAP[ip]) {
                    LOGIN_ATTEMPTS_MAP[ip] = {count: 0, username}
                }
                LOGIN_ATTEMPTS_MAP[ip].lasttry = new Date().getTime()
                LOGIN_ATTEMPTS_MAP[ip].count++
                console.log(`Invalid login attempt from ${username}`)
                Hook.call('invalidLogin', {context, db, username, ip})

                //invalid login
            } else {
                if (LOGIN_ATTEMPTS_MAP[ip]) {
                    delete LOGIN_ATTEMPTS_MAP[ip]
                }

                if (USE_COOKIES) {
                    setAuthCookies(result, req.res)

                    // delete token because it is handled by cookies
                    delete result.token
                }

                if (result.user.requestNewPassword) {
                    // generate reset token
                    const resetToken = crypto.randomBytes(16).toString("hex")
                    await db.collection('User').findOneAndUpdate({_id: ObjectId(result.user._id)}, {
                        $set: {
                            passwordReset: new Date().getTime(),
                            resetToken
                        }
                    })
                    result.resetToken = resetToken
                }

                Hook.call('login', {context, db, user: result.user})
            }
            return result
        },
        logout: async (props, req) => {
            removeAuthCookies(req.res)

            return {status: 'done'}
        },
        forgotPassword: async ({username, url, subject}, req) => {

            const {context, headers} = req
            const userCollection = db.collection('User')

            const resetToken = crypto.randomBytes(16).toString("hex")

            const result = await userCollection.findOneAndUpdate({$or: [{'email': username}, {'username': username}]}, {
                $set: {
                    passwordReset: new Date().getTime(),
                    resetToken
                }
            })

            const user = result.value
            if (user) {
                await sendMail(db, context, {
                    slug: 'core/forgot-password/mail',
                    recipient: user.email,
                    subject: subject || 'Password reset',
                    body: `{"url":"${url}?token=${resetToken}","name":"${user.username}"}`,
                    req
                })

                return {status: 'ok'}
            } else {
                throw new ApiError(`User ${username} does not exist`, 'no.user')
            }
        },
        newPassword: async ({token, password, passwordConfirm}, {context}) => {

            const userCollection = db.collection('User')

            if (passwordConfirm && password !== passwordConfirm) {
                throw new ApiError(`Make sure the passwords match`, 'password.match')
            }

            // Validate Password
            const err = Util.validatePassword(password, context)
            if (err.length > 0) {
                throw new ApiError('Invalid Password: \n' + err.join('\n'), 'password.invalid')
            }


            const hashPassword = Util.hashPassword(password)


            const result = await userCollection.findOneAndUpdate({$and: [{'resetToken': token}, {passwordReset: {$gte: (new Date().getTime()) - 3600000}}]}, {
                $set: {
                    password: hashPassword,
                    requestNewPassword: false,
                    resetToken: null
                }
            })

            const user = result.value

            Hook.call('newPassword', {context, db, user})

            if (user) {
                return {status: 'ok'}
            } else {
                throw new ApiError('Something went wrong. Please try again!', 'general.error')
            }
        },
        confirmEmail: async ({token}, {context}) => {

            const userCollection = db.collection('User')


            const result = await userCollection.findOneAndUpdate({'signupToken': token}, {$set: {emailConfirmed: true}})
            const user = result.value
            if (user) {
                Hook.call('UserConfirmed', {context, db, user})
                return {status: 'ok'}
            } else {
                throw new ApiError('Something went wrong. Please try again!', 'general.error')
            }
        },
        sendConformationEmail: async ({mailTemplate, mailSubject, mailUrl}, req) => {
            const {context} = req
            Util.checkIfUserIsLoggedIn(context)

            const user = await Util.userById(db, context.id)

            sendMail(db, context, {
                slug: mailTemplate,
                recipient: user.email,
                subject: mailSubject,
                body: `{"url":"${mailUrl}${mailUrl && mailUrl.indexOf('?') >= 0 ? '&' : '?'}token=${user.signupToken}","name":"${user.username || user.email}","meta":${JSON.stringify(user.meta)}}`,
                req
            })

            return {status: 'ok'}
        }
    },
    Mutation: {
        createUser: async ({username, password, email, language, meta, picture, emailConfirmed, requestNewPassword, role, junior}, {context}) => {

            if (email) {
                email = email.trim()
            }
            const insertResult = await createUser({
                db,
                context,
                username,
                picture,
                language,
                meta,
                email,
                emailConfirmed,
                requestNewPassword,
                password,
                role,
                junior
            })

            if (insertResult.insertedCount) {
                const doc = insertResult.ops[0]
                return doc
            }
        },
        signUp: async ({password, username, email, mailTemplate, mailSubject, mailUrl, role, meta}, req) => {

            const {context} = req

            if (email) {
                email = email.trim()
            }

            const options = {override: false}

            meta = meta && meta.constructor!==Object ? JSON.parse(meta) : {}

            if (Hook.hooks['beforeSignUp'] && Hook.hooks['beforeSignUp'].length) {
                let c = Hook.hooks['beforeSignUp'].length
                for (let i = 0; i < Hook.hooks['beforeSignUp'].length; ++i) {
                    await Hook.hooks['beforeSignUp'][i].callback({
                        context,
                        options,
                        password,
                        username,
                        email,
                        mailTemplate,
                        mailSubject,
                        mailUrl,
                        role,
                        meta,
                        db
                    })
                }
            }

            const insertResult = await createUser({db, context, username, email, password, meta}, options)

            if (insertResult.insertedCount || insertResult.modifiedCount) {
                if (mailTemplate) {
                    const signupToken = insertResult.ops[0].signupToken

                    sendMail(db, context, {
                        slug: mailTemplate,
                        recipient: email,
                        subject: mailSubject,
                        body: `{"url":"${mailUrl}${mailUrl && mailUrl.indexOf('?') >= 0 ? '&' : '?'}token=${signupToken}","name":"${username || email}","meta":${JSON.stringify(meta)}}`,
                        req
                    })
                }
                const result = await auth.createToken(email, password, db, context)


                if (USE_COOKIES && result.token) {
                    setAuthCookies(result, req.res)

                    // delete token because it is handled by cookies
                    delete result.token
                }


                return result
            }
        },
        updateUser: async ({_id, username, email, password, picture, language, emailConfirmed, requestNewPassword, role, junior, meta}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)

            if (email) {
                email = email.trim()
            }

            const user = {}
            const errors = []
            const userCollection = db.collection('User')

            if (language !== undefined) {
                user.language = language
            }

            if (emailConfirmed !== undefined) {
                user.emailConfirmed = emailConfirmed
            }
            if (requestNewPassword !== undefined) {
                user.requestNewPassword = requestNewPassword
            }
            if (picture !== undefined) {
                user.picture = picture ? ObjectId(picture) : null
            }

            if (username) {
                // Validate Username
                const existingUser = (await userCollection.findOne({$or: [{username}]}))
                if (existingUser != null && existingUser._id.toString() !== _id) {
                    //errors.push({key: 'usernameError', message: `Username ${username} already taken`, messageKey:'username.taken'})
                    throw new ApiError(`Username ${username} already taken`, 'username.taken', {x: 'sss'})
                } else {
                    user.username = username
                }
            }

            if (email) {
                // Validate Email Address
                if (!Util.validateEmail(email)) {
                    errors.push({key: 'emailError', message: 'Email is not valid'})
                } else {
                    const existingUser = (await userCollection.findOne({$or: [{email}]}))
                    if (existingUser != null && existingUser._id.toString() !== _id) {
                        throw new ApiError(`Email ${email} already taken`, 'email.taken')
                    } else {
                        user.email = email
                    }
                }
            }


            if (password) {
                // Validate Password
                const err = Util.validatePassword(password, context)
                if (err.length > 0) {
                    errors.push({key: 'passwordError', message: 'Invalid Password: \n' + err.join('\n')})
                } else {
                    user.password = Util.hashPassword(password)
                    user.requestNewPassword = false
                }
            }

            if (errors.length > 0) {
                throw new ValidationError(errors)
            }

            if (role) {
                await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_USER_ROLE)
                user.role = ObjectId(role)
            }

            if (junior !== undefined) {
                await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_USER_ROLE)
                user.junior = []
                if (junior) {
                    junior.forEach(sup => {
                        user.junior.push(ObjectId(sup))
                    })
                }
            }

            if (meta !== undefined) {
                user.meta = JSON.parse(meta)
            }

            const result = (await userCollection.findOneAndUpdate({_id: ObjectId(_id)}, {$set: user}, {returnOriginal: false}))
            if (result.ok !== 1) {
                throw new ApiError('User could not be changed')
            }


            // clear cache
            Cache.remove('User' + username)
            Cache.remove('User' + _id)

            return result.value

        },
        updateUserRole: async ({_id, name, capabilities}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_OTHER_USERS)

            return await GenericResolver.updateEnity(db, context, 'UserRole', {
                _id,
                name,
                capabilities
            })


            return {_id, name, capabilities}

        },
        updateMe: async (user, {context}) => {
            Util.checkIfUserIsLoggedIn(context)

            const userCollection = db.collection('User')

            let existingUser = (await userCollection.findOne({$or: [{'username': user.username},{'email': user.email}]}))
            if (existingUser != null && existingUser._id.toString() !== context.id) {
                throw new ApiError(`Username or Email already taken`, 'username.taken', {x: 'sss'})
            } else {


                if (user.picture !== undefined) {
                    user.picture = user.picture ? ObjectId(user.picture) : null
                }


                if (user.meta !== undefined) {
                    user.meta = JSON.parse(user.meta)
                }

                const result = (await userCollection.findOneAndUpdate({_id: ObjectId(context.id)}, {$set: user}))
                if (result.ok !== 1) {
                    throw new ApiError('User could not be changed')
                }

                // clear cache
                Cache.set('User' + context.id, null)

                return result.value
            }
        },
        updateNote: async ({_id, value}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)

            const userCollection = db.collection('User')
            var result = null
            if (!_id) {
                throw new Error('Note id is missing')
            } else {
                result = (await userCollection.updateOne({
                    _id: ObjectId(context.id),
                    'note._id': ObjectId(_id)
                }, {$set: {'note.$.value': value}}))
                if (result.matchedCount === 1) {
                    if (result.modifiedCount !== 1) {
                        //throw new Error('Note was not modified')
                    }
                } else {
                    throw new Error('User or Note doesn\'t exist')
                }
            }

            return {value: value, _id: _id}
        },
        createNote: async ({value}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)

            if (!value) value = ''

            const userCollection = db.collection('User')
            const _id = ObjectId()
            let result = (await userCollection.updateOne({_id: ObjectId(context.id)}, {
                $push: {
                    note: {
                        value: value,
                        _id: _id
                    }
                }
            }))

            if (result.modifiedCount !== 1) {
                throw new Error('Note was not inserted')
            }

            return {value: value, _id: _id}
        },
        deleteNote: async ({_id}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)

            const userCollection = db.collection('User')

            var result = null
            if (!_id) {
                throw new Error('Note id is missing')
            } else {
                result = (await userCollection.updateOne({_id: ObjectId(context.id)}, {$pull: {note: {_id: ObjectId(_id)}}}))

                if (result.matchedCount === 1) {
                    if (result.modifiedCount !== 1) {
                        throw new Error('Note doesn\'t exist')
                    }
                } else {
                    throw new Error('User doesn\'t exist')
                }
            }

            return {value: '', _id: _id}
        },
        deleteUser: async ({_id}, {context}) => {
            return GenericResolver.deleteEnity(db, context, 'User', {_id})
        },
        deleteUsers: async ({_id}, {context}) => {
            return GenericResolver.deleteEnities(db, context, 'User', {_id})
        },
        deleteUserRole: async ({_id}, {context}) => {
            return GenericResolver.deleteEnity(db, context, 'UserRole', {_id})
        },
        deleteUserRoles: async ({_id}, {context}) => {
            return GenericResolver.deleteEnities(db, context, 'UserRole', {_id})
        }
    }
})
