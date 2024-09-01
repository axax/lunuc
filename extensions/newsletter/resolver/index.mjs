import {ObjectId} from 'mongodb'
import Util from '../../../api/util/index.mjs'
import {sendMail} from '../../../api/util/mail.mjs'
import crypto from 'crypto'
import {getHostFromHeaders} from '../../../util/host.mjs'
import config from '../../../gensrc/config.mjs'
import Hook from '../../../util/hook.cjs'
import {CAPABILITY_SEND_NEWSLETTER} from '../constants/index.mjs'
import path from 'path'
import genResolver from '../gensrc/resolver.mjs'

export default db => ({
    Query: {
        sendNewsletter: async ({testReceiver, mailing, subject, template, text, html, batchSize, host, list, unsubscribeHeader, users}, req) => {
            await Util.checkIfUserHasCapability(db, req.context, CAPABILITY_SEND_NEWSLETTER)

            if(host){
                // override
                req.headers[':authority'] = host
                req.headers.host = host
            }

            const mailingId = new ObjectId(mailing)

            if(!batchSize){
                batchSize = 10
            }

            const mailingData = await db.collection('NewsletterMailing').findOne(
                {
                    _id: mailingId
                }
            )

            let settings
            if(mailingData){
                if( template === undefined && ObjectId.isValid(mailingData.template)){
                    const cmsPage = await db.collection('CmsPage').findOne(
                        {
                            _id: new ObjectId(mailingData.template)
                        },
                        {
                            slug:1
                        }
                    )
                    if(cmsPage){
                        template = cmsPage.slug
                    }
                }

                settings = mailingData.mailSettings

                if( users === undefined){
                    users = mailingData.users
                }

                if(unsubscribeHeader === undefined){
                    unsubscribeHeader = mailingData.unsubscribeHeader
                }
            }

            const languageToSend = mailingData.language ? mailingData.language.split(',') : []

            let subscribers
            if(testReceiver){
                subscribers = testReceiver.split(',').map(email => {
                    const emailLang = email.split('|')
                    return {email:emailLang[0], language: emailLang.length>1?emailLang[1]:config.DEFAULT_LANGUAGE, testOnly:true}
                })
            }else {

                subscribers = await db.collection('NewsletterSubscriber').find(
                    {state: 'subscribed', list: {$in: list.map(l => l.constructor === String ? new ObjectId(l) : l)}}
                ).toArray()

                if (users) {
                    users.forEach(user => {
                        subscribers.push({account: user, userAccountOnly: true})
                    })
                }
            }

            const sentToEmailAddresses = []

            for (let i = 0; i < subscribers.length; i++) {
                if (sentToEmailAddresses.length >= batchSize) {
                    break
                }
                const sub = subscribers[i]

                let userAccountId
                if(sub.account){
                    if(sub.account.constructor === String) {
                        userAccountId = new ObjectId(sub.account)
                    }else if(sub.account.constructor === Object){
                        userAccountId = sub.account._id
                    }else{
                        userAccountId = sub.account
                    }
                }

                const sent = sub.testOnly ? false : await db.collection('NewsletterSent').findOne(
                    {
                        $or: [{$and:[{subscriber: {$ne: null}}, {subscriber: sub._id}]}, {$and:[{userAccount: {$ne: null}},{userAccount: userAccountId}]}],
                        mailing: mailingId
                    }
                )
                if (!sent) {

                    const sentResult =  sub.testOnly ? false : await db.collection('NewsletterSent').insertOne(
                        {
                            subscriber: sub._id,
                            userAccount: userAccountId,
                            mailing: new ObjectId(mailing)
                        }
                    )

                    if(userAccountId && (!sub.account || sub.account.constructor !== Object)) {
                        sub.account = await db.collection('User').findOne(
                            {_id: userAccountId}
                        )
                    }

                    if(sub.userAccountOnly){
                        if(sub.account) {
                            sub.email = sub.account.email
                        }else{
                            console.warn('account not found')
                            continue
                        }
                    }

                    if (!sub.token && !sub.userAccountOnly) {
                        sub.token = crypto.randomBytes(32).toString("hex")

                        if(sub._id) {
                            await db.collection('NewsletterSubscriber').updateOne({_id: new ObjectId(sub._id)}, {$set: {token: sub.token}})
                        }
                    }
                    sub.mailing = mailing

                    const listHeader = {}

                    if(unsubscribeHeader){
                        // List-Help: <mailto:admin@example.com?subject=help>
                        //help: 'admin@example.com?subject=help',
                        // List-Unsubscribe: <http://example.com> (Comment)
                        listHeader.unsubscribe = {
                            url: `${(req.isHttps ? 'https://' : 'http://')}${getHostFromHeaders(req.headers)}/core/unsubscribe-newsletter?email=${sub.email}&token=${sub.token}&mailing=${sub.mailing}`,
                            comment: 'Unsubscribe'
                        }
                    }
                    /*const headers = {
                        'List-Unsubscribe': `<${(req.isHttps ? 'https://' : 'http://')}${getHostFromHeaders(req.headers)}/core/unsubscribe-newsletter?email=${sub.email}&token=${sub.token}&mailing=${sub.mailing}>, <mailto:info@onyou.ch>`,
                        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
                    }*/


                    let finalSubject = subject,
                        finalText = text,
                        finalHtml = html,
                        finalAttachments,
                        subLang = sub.language || config.DEFAULT_LANGUAGE

                    if(languageToSend.length>0 && languageToSend.indexOf(subLang)<0){
                        // don't send
                        continue
                    }

                    if(mailingData){
                        if(mailingData.subject && subject === undefined){
                            finalSubject = mailingData.subject
                        }
                        if(mailingData.text && text === undefined){
                            finalText = mailingData.text
                        }
                        if(mailingData.html && html === undefined){
                            finalHtml = mailingData.html
                        }
                        if(mailingData.attachment && mailingData.attachment[subLang]){
                            finalAttachments = []
                            const upload_dir = path.join(path.resolve(), config.UPLOAD_DIR)
                            for(const id of mailingData.attachment[subLang]){
                                const media = await db.collection('Media').findOne({_id: id})
                                if(media){
                                    finalAttachments.push({
                                        path: path.join(upload_dir, './' + media._id),
                                        filename: media.name
                                    })
                                }
                            }
                        }
                    }

                    if(finalSubject.constructor === Object){
                        if(finalSubject[subLang]){
                            finalSubject = finalSubject[subLang]
                        }else{
                            finalSubject = finalSubject[config.DEFAULT_LANGUAGE]
                        }
                    }
                    if(finalText.constructor === Object){
                        if(finalText[subLang]){
                            finalText = finalText[subLang]
                        }else{
                            finalText = finalText[config.DEFAULT_LANGUAGE]
                        }
                    }
                    if(finalHtml && finalHtml.constructor === Object){
                        if(finalHtml[subLang]){
                            finalHtml = finalHtml[subLang]
                        }else{
                            finalHtml = finalHtml[config.DEFAULT_LANGUAGE]
                        }
                    }
                    const body = Object.assign({html: finalHtml},sub)

                    if(mailingData && mailingData.contextProps){
                        try {
                            body.props = JSON.parse(mailingData.contextProps)
                        }catch (e) {
                            console.log(e)
                        }
                    }
                    if(mailingData && mailingData.genericData){
                       body.genericData = []
                        for(const id of mailingData.genericData){
                            const data = await db.collection('GenericData').findOne({_id: id})
                            if(data){
                                body.genericData.push(data)
                            }
                        }
                    }

                    console.log('send newsletter', sub.email, body)

                    const result = await sendMail(db, Object.assign(req.context, {lang: subLang}), {
                        slug: template,
                        recipient: sub.email,
                        subject: finalSubject,
                        attachments: finalAttachments,
                        body,
                        text: finalText,
                        headerList: listHeader,
                        req,
                        settings
                    })
                    sentToEmailAddresses.push(sub.email)

                    if(sentResult && sentResult.insertedId) {
                        await db.collection('NewsletterSent').updateOne({_id: sentResult.insertedId}, {$set: {mailResponse: result}})
                    }
                }

            }

            if(!testReceiver && mailingId && sentToEmailAddresses.length===0){
                await genResolver(db).Mutation.updateNewsletterMailing({
                    createdBy: mailingData.createdBy._id,
                    _id:mailingId,
                    state: 'finished',
                    active:false},req,{forceAdminContext:true})

                /*await db.collection('NewsletterMailing').updateOne({
                    _id: mailingId
                }, {$set: {state: 'finished', active:false}})*/
            }
            return {
                status: 'Newsletter sent to: ' + sentToEmailAddresses.join(',')
            }
        },
        subscribeNewsletter: async ({email, replyTo, fromEmail, fromName, confirmSlug, location, url, meta, list}, req) => {

            const {context}  = req

            const collection = db.collection('NewsletterSubscriber')

            // check if there is a user with same email
            const user = (await db.collection('User').findOne({email}))

            const token = crypto.randomBytes(32).toString("hex")
            // insert or update
            const data = {
                $set: {
                    language: context.lang || '',
                    token,
                    email,
                    location,
                    state: 'optin',
                    meta: meta ? JSON.parse(meta) : undefined
                }
            }

            if (user && user._id) {
                data.$set.account = user._id
            }

            if (list) {
                data.$addToSet = {
                    list: {
                        $each: (list ? list.reduce((o, id) => {
                            o.push(new ObjectId(id));
                            return o
                        }, []) : list)
                    }

                }
            }

            const selector = {email}
            if(location){
                selector.location = location
            }

            if (Hook.hooks['beforeNewsletterSubscribe'] && Hook.hooks['beforeNewsletterSubscribe'].length) {
                for (let i = 0; i < Hook.hooks['beforeNewsletterSubscribe'].length; ++i) {
                    await Hook.hooks['beforeNewsletterSubscribe'][i].callback({
                        context,
                        db,
                        selector,
                        data
                    })
                }
            }

            const insertResult = await collection.updateOne(
                selector, data, {upsert: true}
            )

            if (insertResult.modifiedCount || insertResult.matchedCount || insertResult.upsertedCount) {

                let finalUrl
                if(url){
                    finalUrl = url
                }else{
                    finalUrl = (req.isHttps ? 'https://' : 'http://') + getHostFromHeaders(req.headers) + (confirmSlug || '/core/newsletter/optin/confirm')
                }

                await sendMail(db, context, {
                    from: fromEmail,
                    fromName,
                    replyTo,
                    slug: 'core/newsletter/optin/mail',
                    recipient: email,
                    subject: 'Anmeldung Newsletter',
                    body: `{"url":"${finalUrl}?token=${token}&location=${location || ''}"}`,
                    req
                })

                return {status: 'ok'}
            }
        },
        confirmNewsletter: async ({email, token, location}, {context}) => {

            const selector = {}
            if(email){
                selector.email = email
            }
            if(token){
                selector.token = token
            }
            if(location){
                selector.location = location
            }
            const $set = {
                confirmed: true,
                state: 'subscribed'
            }

            let result = await db.collection('NewsletterSubscriber').findOneAndUpdate(selector, {
                $set
            }, {returnOriginal: false, includeResultMetadata: true})

            if (result.ok) {
                return {status: 'ok'}
            }
        },
        unsubscribeNewsletter: async ({email, token, mailing}, {context}) => {

            const collection = db.collection('NewsletterSubscriber')

            const $set = {
                state: 'unsubscribed'
            }
            if(mailing !== undefined){
                $set.unsubscribeMailing = mailing?new ObjectId(mailing):null
            }

            let result = await collection.findOneAndUpdate({email, token}, {
                $set
            }, {returnOriginal: false, includeResultMetadata: true })

            if (result.ok) {
                return {status: 'ok'}
            }
        }
    }
})
