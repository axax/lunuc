import SMTPServer from './smtp/index.mjs'
import IMAPServer from './imap/index.mjs'
import Hook from '../../util/hook.cjs'
import schemaGen from './gensrc/schema.mjs'
import resolverGen from './gensrc/resolver.mjs'
import {deepMergeToFirst} from '../../util/deepMerge.mjs'
import {ObjectId} from 'mongodb'
import {
    clearCacheForUserAccount,
    getFolderForMailAccount,
    getFolderForMailAccountById
} from './util/index.mjs'


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
    if(type==='MailAccountFolder'){
        db.collection('MailAccountFolder').findOne({_id: new ObjectId(data._id)}, {projection: {mailAccount:1}}).then((folder)=>{
            clearCacheForUserAccount(folder.mailAccount)
        })
    }else if(type==='MailAccountMessage'){
        const st = new Date().getTime()
        const fullMessage = await db.collection('MailAccountMessage').findOne({_id: new ObjectId(data._id)}, { projection: { _id: 1, mailAccount:1,mailAccountFolder:1 } })
        if(fullMessage.mailAccount){
            let inbox
            const folderId = data.mailAccountFolder || fullMessage.mailAccountFolder
            if(folderId){
                inbox = await getFolderForMailAccountById(db, fullMessage.mailAccount, folderId)
            }else{
                inbox = await getFolderForMailAccount(db, fullMessage.mailAccount, 'INBOX')
            }
            if(inbox) {
                if(data.mailAccountFolder === undefined) {
                    data.mailAccountFolder = inbox._id
                }

                inbox.modifyIndex++
                data.modseq = inbox.modifyIndex

                if(!fullMessage.uid){
                    data.uid = inbox.uidNext
                    inbox.uidNext++
                }

                db.collection('MailAccountFolder').updateOne({_id: inbox._id}, {$set: {uidNext: inbox.uidNext, modifyIndex: inbox.modifyIndex}})
            }
        }
        console.log(`${ new Date().getTime() - st}ms`, fullMessage)

    }
})
Hook.on(['typeBeforeCreate'], async ({db, type, data}) => {
    if(type==='MailAccountFolder'){
        if(data.mailAccount) {
            clearCacheForUserAccount(data.mailAccount)
        }
    }else if(type==='MailAccountMessage'){
        let mailAccount
        if(data.mailAccount){
            mailAccount = await db.collection('MailAccount').findOne({_id: data.mailAccount})
        } else {
            mailAccount = await getMailAccountFromMailData(db, data.data)
        }
        if(mailAccount){
            data.mailAccount = mailAccount._id

            let mailAccountFolder
            if(data.mailAccountFolder){
                mailAccountFolder = await getFolderForMailAccountById(db,mailAccount._id,data.mailAccountFolder)
            } else {
                mailAccountFolder = await getFolderForMailAccount(db, mailAccount._id, 'INBOX')
            }

            if(mailAccountFolder) {
                data.mailAccountFolder = mailAccountFolder._id

                // is modseq really needed here?
                mailAccountFolder.modifyIndex++
                data.modseq = mailAccountFolder.modifyIndex

                data.uid = mailAccountFolder.uidNext
                mailAccountFolder.uidNext++
                await db.collection('MailAccountFolder').updateOne({_id: mailAccountFolder._id}, {$set: {uidNext: mailAccountFolder.uidNext,modifyIndex:mailAccountFolder.modifyIndex}})
            }
        }
    }
})