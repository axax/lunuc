import Hook from '../../util/hook.cjs'
import schemaGen from './gensrc/schema.mjs'
import resolverGen from './gensrc/resolver.mjs'
import schema from './schema/index.mjs'
import resolver from './resolver/index.mjs'
import {deepMergeToFirst} from '../../util/deepMerge.mjs'
import {ObjectId} from 'mongodb'
import {CAPABILITY_SEND_NEWSLETTER} from './constants/index.mjs'

// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolver(db), resolverGen(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schemaGen)
    schemas.push(schema)
})

// Hook to add or modify user roles
Hook.on('createUserRoles', ({userRoles}) => {
    userRoles.forEach(userRole => {
        if (['administrator', 'editor', 'author'].indexOf(userRole.name) >= 0) {
            console.log(`Add capabilities "${CAPABILITY_SEND_NEWSLETTER}" for user role "${userRole.name}"`)
            userRole.capabilities.push(CAPABILITY_SEND_NEWSLETTER)
        }
    })
})

// Hook to add mongodb schema
Hook.on('NewUserCreated', async ({meta, email, insertResult, db, language}) => {
    if (insertResult.insertedId) {
        if (meta && meta.newsletter) {
            const user = (await db.collection('User').findOne({email}))

            // insert or update
            const data = {
                email, list: (meta.newsletterList ? meta.newsletterList.reduce((o, id) => {
                    o.push(ObjectId(id));
                    return o
                }, []) : []), confirmed: false, state: 'optin'
            }

            if (meta.newsletterLocation) {
                data.location = meta.newsletterLocation
            }

            if (user && user._id) {
                data.account = user._id
            }

            if( language ){
                data.language = language
            }

            const insertResult = await db.collection('NewsletterSubscriber').insertOne(data)
        }
    }
})

Hook.on('UserConfirmed', async ({context,db, user}) => {
    if (user && user.meta && user.meta.newsletter) {
        // also confirm newsletter
        resolver(db).Query.confirmNewsletter({email: user.email, location: user.meta.newsletterLocation}, {context})
    }
})

