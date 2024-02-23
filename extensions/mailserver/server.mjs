import SMTPServer from './smtp/index.mjs'
import IMAPServer from './imap/index.mjs'
import Hook from '../../util/hook.cjs'
import schemaGen from './gensrc/schema.mjs'
import resolverGen from './gensrc/resolver.mjs'
import {deepMergeToFirst} from '../../util/deepMerge.mjs'
import {ObjectId} from 'mongodb'
import {getFolderForMailAccount, getFolderForMailAccountById, getMailAccountByEmail} from './util/index.mjs'


// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolverGen(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schemaGen)
})


// Hook when db is ready
Hook.on('appready', async ({app, context, db}) => {
    SMTPServer.startListening(db, context)
    IMAPServer.startListening(db, context)
})

Hook.on(['typeBeforeUpdate'], async ({db, type,data}) => {
    if(type==='MailAccountMessage'){
        const fullMessage = await db.collection('MailAccountMessage').findOne({_id: new ObjectId(data._id)})

        if(fullMessage.mailAccount){
            let inbox
            if(fullMessage.mailAccountFolder){
                inbox = await getFolderForMailAccountById(db, fullMessage.mailAccount, fullMessage.mailAccountFolder)
            }else{
                inbox = await getFolderForMailAccount(db, fullMessage.mailAccount, 'INBOX')
            }
console.log(data)
            if(inbox) {
                if(data.mailAccountFolder === undefined) {
                    data.mailAccountFolder = inbox._id
                }

                inbox.modifyIndex++
                data.modseq = inbox.modifyIndex
                await db.collection('MailAccountFolder').updateOne({_id: inbox._id}, {$set: {modifyIndex: inbox.modifyIndex}})
            }
        }
    }
})
Hook.on(['typeBeforeCreate'], async ({db, type,data}) => {
    if(type==='MailAccountMessage'){

        if(data.to){
            const mailAccount = await getMailAccountByEmail(db, data.to)
            if(mailAccount){
                data.mailAccount = mailAccount._id
                const inbox = await getFolderForMailAccount(db, mailAccount._id, 'INBOX')
                if(inbox) {
                    data.mailAccountFolder = inbox._id
                    inbox.modifyIndex++
                    data.modseq = inbox.modifyIndex
                    data.uid = inbox.uidNext
                    inbox.uidNext++
                    await db.collection('MailAccountFolder').updateOne({_id: inbox._id}, {$set: {uidNext: inbox.uidNext,modifyIndex:inbox.modifyIndex}})
                }
            }
        }
    }
})