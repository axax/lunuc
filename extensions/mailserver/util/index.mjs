import ApiUtil from '../../../api/util/index.mjs'

const mailAccountFoldersMap = {}

export const clearCacheForUserAccount = (mailAccountId)=>{
    delete mailAccountFoldersMap[mailAccountId.toString()]
}
export const getMailAccountByEmail = async (db, address)=> {
    const addressParts = address.split('@'),
        username = addressParts[0],
        host = addressParts[1]
    const mailAccount = await db.collection('MailAccount').findOne({username, host, active: true})
    return mailAccount
}

export const getFoldersForMailAccount  = async (db, mailAccountId) =>  {
    const mailAccountIdString = mailAccountId.toString()
    if(!mailAccountFoldersMap[mailAccountIdString]){
        const collectionResult = await db.collection('MailAccountFolder').find({mailAccount:mailAccountId}).toArray()

        mailAccountFoldersMap[mailAccountIdString] = new Map()
        if(collectionResult.length === 0){
            // create inbox
            const anonymousUser = await ApiUtil.userByName(db, 'anonymous')

            const defaultMailboxes = [
                {path:'INBOX',symbol:'INBOX'},
                {path:'Drafts',symbol:'Drafts',special_use:'\\Drafts'},
                {path:'Sent Messages',symbol:'Sent Messages',special_use:'\\Sent'},
                {path:'Junk',symbol:'Junk',special_use:'\\Junk'},
                {path:'Deleted Messages',symbol:'Deleted Messages',special_use:'\\Trash'},
                {path:'Archive',symbol:'Archive',special_use:'\\Archive'},
                {path:'Notes',symbol:'Notes'}
            ]

            for(let i = 0; i<defaultMailboxes.length;i++) {
                const mailbox = defaultMailboxes[i]
                const inbox = {
                    createdBy: anonymousUser._id,
                    subscribed: true,
                    path: mailbox.path,
                    specialUse: mailbox.special_use,
                    uidValidity: i + 1,
                    uidNext: 1,
                    modifyIndex: 1,
                    symbol: mailbox.symbol,
                    mailAccount: mailAccountId
                }

                const insertedData = await db.collection('MailAccountFolder').insertOne(inbox)
                inbox._id = insertedData.insertedId
                collectionResult.push(inbox)
            }
        }

        collectionResult.forEach(entry=>{
            if(entry.symbol) {
                entry.symbol = Symbol(entry.symbol)
            }

            mailAccountFoldersMap[mailAccountIdString].set(entry.path,entry)
        })
    }
    return mailAccountFoldersMap[mailAccountIdString]
}

export const getFolderForMailAccount = async (db, mailAccountId, path) => {
    const mailAccountFolders = await getFoldersForMailAccount(db,mailAccountId)
    return mailAccountFolders.get(path)
}

export const getFolderForMailAccountById = async (db, mailAccountId, id) => {
    const mailAccountFolders = await getFoldersForMailAccount(db,mailAccountId)
    for (const [key, value] of mailAccountFolders) {
        if (value._id.equals(id)) {
            return value
        }
    }
    return null
}

export const getSubscribedFoldersForMailAccount  = async (db, mailAccountId) =>  {
    const mailAccountFolders = await getFoldersForMailAccount(db,mailAccountId)

    let subscribed = [];
    mailAccountFolders.forEach(folder => {
        if (folder.subscribed) {
            subscribed.push(folder)
        }
    })
    return subscribed
}

export const getMessageUidsForFolderId = async (db, mailAccountFolderId, query = {}) => {
    return await db.collection('MailAccountMessage').distinct('uid',{mailAccountFolder: mailAccountFolderId, ...query})
}

export const getMessagesForFolder = async (db, mailAccountFolderId) => {
    return await db.collection('MailAccountMessage').find({mailAccountFolder: mailAccountFolderId}).toArray()
}
export const getMessagesForFolderByUids = async (db, mailAccountFolderId, uids, fields) => {
    const aggr = [
        {
            $match: {
                uid: { $in: uids },
                mailAccountFolder: mailAccountFolderId
            }
        }
    ]
    if(fields!=='ALL'){
        aggr.push({ $project: { uid: 1, flags: 1, modseq: 1, _id:1}})
    }
    return await db.collection('MailAccountMessage').aggregate( aggr ).toArray()
}


export const deleteMessagesForFolderByUids = async (db, mailAccountFolderId, uids) => {
    return await db.collection('MailAccountMessage').deleteMany( {
        uid: { $in: uids },
        mailAccountFolder: mailAccountFolderId
    } )
}