import Util from '../util/index.mjs'
import {ObjectId} from 'mongodb'
import {auth} from '../auth.mjs'
import {ApiError, ValidationError} from '../error.mjs'
import GenericResolver from './generic/genericResolver.mjs'
import Cache from '../../util/cache.mjs'
import {
    CAPABILITY_MANAGE_USER_ROLE,
    CAPABILITY_MANAGE_OTHER_USERS,
    CAPABILITY_MANAGE_USER_GROUP,
    CAPABILITY_MANAGE_SAME_GROUP
} from '../../util/capabilities.mjs'
import {sendMail} from '../util/mail.mjs'
import crypto from 'crypto'
import {clientAddress} from '../../util/host.mjs'
import {setAuthCookies, removeAuthCookies} from '../util/sessionContext.mjs'
import {_t} from '../../util/i18nServer.mjs'
import Hook from '../../util/hook.cjs'
import {USE_COOKIES} from '../constants/index.mjs'
import {hasQueryField} from '../util/graphql.js'

const LOGIN_ATTEMPTS_MAP = {},
    MAX_LOGIN_ATTEMPTS = 10,
    LOGIN_DELAY_IN_SEC = 180

const createUser = async ({username, role, junior, group, setting, password, language, email, emailConfirmed, blocked, requestNewPassword, meta, domain, picture, db, context}, opts) => {

    if (!opts) {
        opts = {override: false, skipCheck: false}
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

    const findMatch = {$or: [{'email': email}, {'username': username}]}

    if(!domain && context.domain) {
        // set domain from current user as default
         domain = context.domain
    }

    if (domain) {
        findMatch.domain = domain
    }
    const existingUser = (await userCollection.findOne(findMatch))
    const userExists = existingUser != null

    if (!opts.override) {

        if (userExists) {
            errors.push({key: 'usernameError', message: _t('core.signup.usertaken', context.lang)})
            throw new ValidationError(errors)
        }
    }

    if (meta !== undefined && meta !== null) {
        if (meta.constructor !== Object) {
            meta = JSON.parse(meta)
        }
    }


    const signupToken = crypto.randomBytes(16).toString("hex")
    const hashedPw = Util.hashPassword(password)

    let roleId
    if(role){
        if (await Util.userHasCapability(db, context, CAPABILITY_MANAGE_USER_ROLE)) {
            roleId = new ObjectId(role)
        }else{
            const roleEntry = await Util.getUserRoles(db, role)

            if(['subscriber',context.role].indexOf(roleEntry.name)>=0) {
                roleId = new ObjectId(role)
            }
        }
    }
    if(!roleId){
        const userRole = (await db.collection('UserRole').findOne({name: 'subscriber'}))
        roleId = userRole._id
    }

    const juniorIds = []
    if (junior && await Util.userHasCapability(db, context, CAPABILITY_MANAGE_USER_ROLE)) {
        junior.forEach(sup => {
            juniorIds.push(new ObjectId(sup))
        })
    }
    const groupIds = []
    if (group && (opts.skipCheck || await Util.userHasCapability(db, context, CAPABILITY_MANAGE_USER_GROUP))) {
        group.forEach(sup => {
            groupIds.push(new ObjectId(sup))
        })
    } else if (context.group && await Util.userHasCapability(db, context, CAPABILITY_MANAGE_SAME_GROUP)) {
        // copy group of current user
        context.group.forEach(g => {
            groupIds.push(new ObjectId(g))
        })
    }

    const settingsIds = []
    if (setting) {
        setting.forEach(s => {
            settingsIds.push(new ObjectId(s))
        })
    }

    const dataToInsert = {
        role: roleId,
        group: groupIds,
        setting: settingsIds,
        junior: juniorIds,
        emailConfirmed: !!emailConfirmed,
        blocked: !!blocked,
        requestNewPassword: !!requestNewPassword,
        email: email,
        username: username,
        password: hashedPw,
        picture,
        meta,
        language: language || context.lang,
        signupToken: signupToken
    }

    if (domain) {
        dataToInsert.domain = domain
    }


    let insertResult
    if (!opts.override || !userExists) {
        insertResult = await userCollection.insertOne(dataToInsert)
        dataToInsert._id = insertResult.insertedId
    } else {
        insertResult = await userCollection.updateOne(
            {_id: existingUser._id},
            {
                $set: dataToInsert
            }
        )
        dataToInsert._id = existingUser._id

    }
    insertResult.ops = [dataToInsert]

    Hook.call('NewUserCreated', {insertResult, meta, email, db, language: dataToInsert.language})

    return insertResult

}


const validateAndHashPassword = ({password, passwordConfirm, context}) => {
    if (passwordConfirm && password !== passwordConfirm) {
        throw new ApiError(`Make sure the passwords match`, 'password.match')
    }

    // Validate Password
    const err = Util.validatePassword(password, context)
    if (err.length > 0) {
        throw new ApiError('Invalid Password: \n' + err.join('\n'), 'password.invalid')
    }


    return Util.hashPassword(password)
}

export const userResolver = (db) => ({
    Query: {
        users: async ({limit, page, offset, filter, sort}, {context, res}) => {
            Util.checkIfUserIsLoggedIn(context)
            const options = {
                limit,
                page,
                offset,
                filter,
                sort
            }
            if(filter && filter.indexOf('=')<0 && !sort){
                // boost username
                options.projectResult = res.req.body.query.indexOf('role{_id')<0
                options.project = {
                    _id: 1,
                    customOrder:{
                        $cond: {
                            if: {
                                $regexMatch: {
                                    input: "$username",
                                    regex: '^'+filter,
                                    options: "i"
                                }
                            },
                            then: 20,
                            else: {
                                $cond: {
                                    if: {
                                        $regexMatch: {
                                            input: "$username",
                                            regex: filter,
                                            options: "i"
                                        }
                                    },
                                    then: 10,
                                    else: 0
                                }
                            }
                        }
                    }
                }
                options.sort = 'customOrder desc'
            }
            return await GenericResolver.entities(db, context, 'User', ['username', 'password', 'signupToken', 'language', 'picture', 'email', 'meta', 'domain', 'emailConfirmed', 'blocked', 'requestNewPassword', 'role$UserRole', 'junior$[User]', 'group$[UserGroup]', 'setting$[UserSetting]', 'lastLogin', 'lastActive'], options)
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
        userSettings: async ({limit, page, offset, filter, sort}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)
            return await GenericResolver.entities(db, context, 'UserSetting', ['name'], {
                limit,
                page,
                offset,
                filter,
                sort
            })
        },
        me: async (data, {context}, {fieldNodes}) => {
            if(!context.id){
                return
            }

            Util.checkIfUserIsLoggedIn(context)
            const user = (await db.collection('User').findOneAndUpdate({_id: new ObjectId(context.id)}, {$set: {lastActive: new Date().getTime()}})).value
            if (!user) {
                throw new Error('User doesn\'t exist')
            }else if(user.blocked){
                throw new Error(_t('core.login.blocked', context.lang))
            } else {
                user.role = await Util.getUserRoles(db, user.role)

                if (user.meta) {
                    user.meta = JSON.stringify(user.meta)
                }
                if (user.group) {
                    user.group = user.group.map(m => ({_id: m}))
                }

                if (user.setting) {
                    user.setting = user.setting.map(m => ({_id: m}))
                }

                if( user.picture){
                    if(hasQueryField(fieldNodes,'me.picture.name')) {
                        // resolve whole picture
                        user.picture = await db.collection('Media').findOne({_id: new ObjectId(user.picture)})
                    }else{
                        user.picture = {_id: user.picture}
                    }
                }
            }
            return user
        },
        publicUsers: async ({limit, offset}, {context, query}) => {
            Util.checkIfUserIsLoggedIn(context)

            const userCollection = db.collection('User')


            let users = (await userCollection.aggregate([
                /*{
                 $match: {
                 users: {$in: [new ObjectId(context.id)]}
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
        login: async ({username, password, domain}, req) => {
            const {context} = req
            const ip = clientAddress(req)

            if (LOGIN_ATTEMPTS_MAP[ip] && LOGIN_ATTEMPTS_MAP[ip].count >= MAX_LOGIN_ATTEMPTS) {
                const time = new Date().getTime()

                if (time - LOGIN_ATTEMPTS_MAP[ip].lasttry < LOGIN_DELAY_IN_SEC * 1000) {
                    return {error: _t('core.login.blocked.temporarily', context.lang), token: null, user: null}
                } else {
                    delete LOGIN_ATTEMPTS_MAP[ip]
                }
            }

            const result = await auth.createToken({username, password, domain, db, context})

            /*if(!result.token && domain) {
                //try without domain
                result = await auth.createToken({username, password, db, context})
            }*/

            if (!result.token) {

                if (!LOGIN_ATTEMPTS_MAP[ip]) {
                    LOGIN_ATTEMPTS_MAP[ip] = {count: 0, username}
                }
                LOGIN_ATTEMPTS_MAP[ip].lasttry = new Date().getTime()
                LOGIN_ATTEMPTS_MAP[ip].count++
                console.log(`Invalid login attempt from ${username}`)
                Hook.call('invalidLogin', {context, db, username, domain, ip})

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
                    await db.collection('User').findOneAndUpdate({_id: new ObjectId(result.user._id)}, {
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
        forgotPassword: async ({username, url, subject, fromEmail, fromName, domain}, req) => {

            const {context} = req
            const userCollection = db.collection('User')

            const resetToken = crypto.randomBytes(16).toString("hex")

            const findMatch = {$or: [{'email': username}, {'username': username}]}

            if (domain) {
                findMatch.domain = domain
            }

            const result = await userCollection.findOneAndUpdate(findMatch, {
                $set: {
                    passwordReset: new Date().getTime(),
                    resetToken
                }
            })

            const user = result.value
            if (user) {
                sendMail(db, context, {
                    from: fromEmail,
                    fromName,
                    slug: 'core/forgot-password/mail',
                    recipient: user.email,
                    subject: subject || 'Password reset',
                    body: `{"url":"${url}?token=${resetToken}","name":"${user.username}"}`,
                    req
                })
            } else {
                const ip = clientAddress(req)

                GenericResolver.createEntity(db, {context}, 'Log', {
                    location: 'forgotPassword',
                    type: 'invalidUser',
                    message: `User ${username} does not exist`,
                    meta: {username, ip, domain}
                })
            }
            return {status: 'ok'}
        },
        newPassword: async ({token, password, passwordConfirm}, {context}) => {

            const userCollection = db.collection('User')


            const hashedPassword = validateAndHashPassword({password, passwordConfirm, context})

            const result = await userCollection.findOneAndUpdate({$and: [{'resetToken': token}, {passwordReset: {$gte: (new Date().getTime()) - 3600000}}]}, {
                $set: {
                    password: hashedPassword,
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
        sendConformationEmail: async ({mailTemplate, mailSubject, mailUrl, fromEmail, fromName, replyTo}, req) => {
            const {context} = req
            Util.checkIfUserIsLoggedIn(context)

            const user = await Util.userById(db, context.id)

            sendMail(db, context, {
                from: fromEmail,
                fromName,
                replyTo,
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
        createUser: async ({username, password, email, language, meta, domain, picture, emailConfirmed, blocked, requestNewPassword, role, junior, group, setting}, {context}) => {


            if(!await Util.userHasAccessRights(db,context,{typeName:'User', access:'create'})){
                throw new Error('Benutzer hat keine Berechtigung um neue Benutzer zu erstellen')
            }

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
                domain,
                email,
                emailConfirmed,
                blocked,
                requestNewPassword,
                password,
                role,
                junior,
                group,
                setting
            })

            if (insertResult.ops && insertResult.ops.length > 0) {
                const doc = insertResult.ops[0]
                return doc
            }
        },
        signUp: async ({password, username, domain, email, mailTemplate, mailSubject, mailUrl, meta, fromEmail, fromName, replyTo}, req) => {

            const {context} = req

            if (email) {
                email = email.trim()
            }

            const options = {override: false}

            meta = meta && meta.constructor !== Object ? JSON.parse(meta) : {}

            const newUserData = {username, email, password, meta, domain}
            if (Hook.hooks['beforeSignUp'] && Hook.hooks['beforeSignUp'].length) {
                let c = Hook.hooks['beforeSignUp'].length
                for (let i = 0; i < Hook.hooks['beforeSignUp'].length; ++i) {
                    await Hook.hooks['beforeSignUp'][i].callback({
                        context,
                        options,
                        mailTemplate,
                        mailSubject,
                        mailUrl,
                        db,
                        newUserData,
                        /* the following parameters are deprecated use newUserData object instead */
                        password,
                        username,
                        email,
                        meta,
                        domain
                    })
                }
            }

            const insertResult = await createUser({db, context, ...newUserData}, options)

            if (insertResult.ops && insertResult.ops.length > 0) {
                if (mailTemplate) {
                    const signupToken = insertResult.ops[0].signupToken

                    sendMail(db, context, {
                        replyTo,
                        fromName,
                        from: fromEmail,
                        slug: mailTemplate,
                        recipient: email,
                        subject: mailSubject,
                        body: `{"url":"${mailUrl}${mailUrl && mailUrl.indexOf('?') >= 0 ? '&' : '?'}token=${signupToken}","name":"${username || email}","meta":${JSON.stringify(meta)}}`,
                        req
                    })
                }
                const result = await auth.createToken({username: email, password, domain, db, context})


                if (USE_COOKIES && result.token) {
                    setAuthCookies(result, req.res)

                    // delete token because it is handled by cookies
                    delete result.token
                }


                return result
            }
        },
        updateUser: async ({_id, username, email, password, picture, language, emailConfirmed, blocked, requestNewPassword, role, junior, meta, domain, group, setting}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)

            if(!await Util.userHasAccessRights(db,context,{typeName:'User', access:'update'})){
                throw new Error('Benutzer hat keine Berechtigung um Benutzer zu bearbeiten')
            }

            if (email) {
                email = email.trim()
            }

            const user = {}
            const errors = []
            const userCollection = db.collection('User')

            if (domain !== undefined) {
                user.domain = domain
            }

            if (language !== undefined) {
                user.language = language
            }

            if (emailConfirmed !== undefined) {
                user.emailConfirmed = emailConfirmed
            }
            if (blocked !== undefined) {
                user.blocked = blocked
            }
            if (requestNewPassword !== undefined) {
                user.requestNewPassword = requestNewPassword
            }
            if (picture !== undefined) {
                user.picture = picture ? new ObjectId(picture) : null
            }

            if (username) {
                // Validate Username
                const existingUser = (await userCollection.findOne({
                    domain: domain ? domain : undefined,
                    $or: [{username}]
                }))
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
                    const existingUser = (await userCollection.findOne({
                        domain: domain ? domain : undefined,
                        $or: [{email}]
                    }))
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
                const roleEntry = await Util.getUserRoles(db, role)

                if(['subscriber',context.role].indexOf(roleEntry.name)<0) {
                    await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_USER_ROLE)
                }
                user.role = new ObjectId(role)
            }
            if (junior !== undefined) {
                await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_USER_ROLE)
                user.junior = []
                if (junior) {
                    junior.forEach(sup => {
                        user.junior.push(new ObjectId(sup))
                    })
                }
            }
            if (setting !== undefined) {
                user.setting = []
                if (setting) {
                    setting.forEach(s => {
                        user.setting.push(new ObjectId(s))
                    })
                }
            }

            if (group !== undefined) {
                await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_USER_GROUP)
                user.group = []
                if (group) {
                    group.forEach(sup => {
                        user.group.push(new ObjectId(sup))
                    })
                }
            }

            const userCanManageOthers = await Util.userHasCapability(db, context, CAPABILITY_MANAGE_OTHER_USERS)


            const match = {_id: new ObjectId(_id)}

            if (!userCanManageOthers && _id !== context.id) {

                const userCanManageSameGroup = await Util.userHasCapability(db, context, CAPABILITY_MANAGE_SAME_GROUP)

                if (userCanManageSameGroup) {
                    match.group = {$in: context.group.map(f => new ObjectId(f))}
                } else {
                    throw new ApiError('User can not change other users')
                }
            }


            if (meta !== undefined) {
                if (meta.constructor === Object) {
                    user.meta = meta
                } else {
                    user.meta = JSON.parse(meta)
                }
            }

            const result = (await userCollection.findOneAndUpdate(match, {$set: user}, {returnOriginal: false}))
            if (result.ok !== 1) {
                throw new ApiError('User could not be changed')
            }


            // clear cache
            Cache.remove('User' + username)
            Cache.remove('User' + _id)

            return result.value

        },
        createUserRole: async ({name, capabilities}, req) => {
            await Util.checkIfUserHasCapability(db, req.context, CAPABILITY_MANAGE_OTHER_USERS)

            return await GenericResolver.createEntity(db, req, 'UserRole', {
                name,
                capabilities
            })
        },
        createUserSetting: async ({name}, req) => {
            return await GenericResolver.createEntity(db, req, 'UserSetting', {
                name
            })
        },
        updateUserRole: async ({_id, name, capabilities}, {context}) => {
            await Util.checkIfUserHasCapability(db, context, CAPABILITY_MANAGE_OTHER_USERS)

            return await GenericResolver.updateEnity(db, context, 'UserRole', {
                _id,
                name,
                capabilities
            })

        },
        updateUserSetting: async ({_id, name, createdBy}, {context}) => {
            return await GenericResolver.updateEnity(db, context, 'UserSetting', {
                _id,
                name,
                createdBy:(createdBy?new ObjectId(createdBy):createdBy)
            })

        },
        updateMe: async ({password, passwordConfirm, ...user}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)

            if(!await Util.userHasAccessRights(db,context,{typeName:'User', access:'update'})){
                throw new Error('Benutzer hat keine Berechtigung um Benutzer zu beabeiten')
            }

            const userCollection = db.collection('User')

            let existingUser = (await userCollection.findOne({$or: [{'username': user.username}, {'email': user.email}]}))
            if (existingUser != null && existingUser._id.toString() !== context.id) {
                throw new ApiError(`Username or Email already taken`, 'username.taken', {x: 'sss'})
            } else {


                if (user.picture !== undefined) {
                    user.picture = user.picture && ObjectId.isValid(user.picture) ? new ObjectId(user.picture) : null
                }


                if (user.meta !== undefined) {
                    user.meta = JSON.parse(user.meta)
                }

                if (password && passwordConfirm) {
                    user.password = validateAndHashPassword({password, passwordConfirm, context})
                }

                const result = (await userCollection.findOneAndUpdate({_id: new ObjectId(context.id)}, {$set: user}))
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

            if(!await Util.userHasAccessRights(db,context,{typeName:'User', access:'update'})){
                throw new Error('Benutzer hat keine Berechtigung um Benutzer zu bearbeiten')
            }

            const userCollection = db.collection('User')
            var result = null
            if (!_id) {
                throw new Error('Note id is missing')
            } else {
                result = (await userCollection.updateOne({
                    _id: new ObjectId(context.id),
                    'note._id': new ObjectId(_id)
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

            if(!await Util.userHasAccessRights(db,context,{typeName:'User', access:'update'})){
                throw new Error('Benutzer hat keine Berechtigung um Benutzer zu bearbeiten')
            }

            if (!value) value = ''

            const userCollection = db.collection('User')
            const _id = new ObjectId()
            let result = (await userCollection.updateOne({_id: new ObjectId(context.id)}, {
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

            if(!await Util.userHasAccessRights(db,context,{typeName:'User', access:'update'})){
                throw new Error('Benutzer hat keine Berechtigung um Benutzer zu bearbeiten')
            }

            const userCollection = db.collection('User')

            var result = null
            if (!_id) {
                throw new Error('Note id is missing')
            } else {
                result = (await userCollection.updateOne({_id: new ObjectId(context.id)}, {$pull: {note: {_id: new ObjectId(_id)}}}))

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
        },
        deleteUserSetting: async ({_id}, {context}) => {
            return GenericResolver.deleteEnity(db, context, 'UserSetting', {_id})
        },
        deleteUserSettings: async ({_id}, {context}) => {
            return GenericResolver.deleteEnities(db, context, 'UserSetting', {_id})
        }
    }
})
