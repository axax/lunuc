import {ObjectId} from 'mongodb'
import Util from '../../../api/util/index.mjs'
import {sendMail} from '../../../api/util/mail.mjs'
import crypto from 'crypto'
import {getHostFromHeaders} from '../../../util/host.mjs'
import config from '../../../gensrc/config.mjs'
import Hook from '../../../util/hook.cjs'
import {CAPABILITY_SEND_NEWSLETTER} from '../constants/index.mjs'

export default db => ({
    Query: {
        sendNewsletter: async ({mailing, subject, template, text, html, batchSize, list}, req) => {
            await Util.checkIfUserHasCapability(db, req.context, CAPABILITY_SEND_NEWSLETTER)
            let result
            const mailingId = ObjectId(mailing)

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
                if( template === undefined){
                    template = mailingData.template
                }

                settings = mailingData.mailSettings
            }

            const languageToSend = mailingData.language ? mailingData.language.split(',') : []


            const subscribers = await db.collection('NewsletterSubscriber').find(
                {state: 'subscribed', list: {$in: list.map(l => l.constructor===String?ObjectId(l):l)}}
            ).toArray()

            const emails = []

            for (let i = 0; i < subscribers.length; i++) {
                if (emails.length >= batchSize) {
                    break
                }
                const sub = subscribers[i]

                const sent = await db.collection('NewsletterSent').findOne(
                    {
                        subscriber: sub._id,
                        mailing: mailingId
                    }
                )
                if (!sent) {

                    sub.account = await db.collection('User').findOne(
                        {_id: ObjectId(sub.account)}
                    )
                    if (!sub.token) {
                        sub.token = crypto.randomBytes(32).toString("hex")

                        await db.collection('NewsletterSubscriber').updateOne({_id: ObjectId(sub._id)}, {$set: {token: sub.token}})

                    }
                    sub.mailing = mailing

                    const headerList = {
                        // List-Help: <mailto:admin@example.com?subject=help>
                        //help: 'admin@example.com?subject=help',
                        // List-Unsubscribe: <http://example.com> (Comment)
                        unsubscribe: {
                            url: `${(req.isHttps ? 'https://' : 'http://')}${getHostFromHeaders(req.headers)}/core/unsubscribe-newsletter?email=${sub.email}&token=${sub.token}&mailing=${sub.mailing}`,
                            comment: 'Unsubscribe'
                        }
                    }


                    let finalSubject = subject,
                        finalText = text,
                        finalHtml = html,
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

                    const result = await sendMail(db, Object.assign(req.context, {lang: subLang}), {
                        slug: template,
                        recipient: sub.email,
                        subject: finalSubject,
                        body,
                        text: finalText,
                        headerList,
                        req,
                        settings
                    })
                    emails.push(sub.email)

                    db.collection('NewsletterSent').insertOne(
                        {
                            subscriber: sub._id,
                            mailing: ObjectId(mailing),
                            mailResponse: result
                        }
                    )
                }

            }
            return {
                status: 'Newsletter sent to: ' + emails.join(',')
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
                            o.push(ObjectId(id));
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

            let result = (await db.collection('NewsletterSubscriber').findOneAndUpdate(selector, {
                $set
            }, {returnOriginal: false}))

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
                $set.unsubscribeMailing = mailing?ObjectId(mailing):null
            }

            let result = (await collection.findOneAndUpdate({email, token}, {
                $set
            }, {returnOriginal: false}))

            if (result.ok) {
                return {status: 'ok'}
            }
        }
    }
})