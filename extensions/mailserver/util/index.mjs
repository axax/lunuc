import ApiUtil from '../../../api/util/index.mjs'

export const getMailAccountByEmail = async (db, address)=> {
    const addressParts = address.split('@'),
        username = addressParts[0],
        host = addressParts[1]
    const mailAccount = await db.collection('MailAccount').findOne({username, host, active: true})
    return mailAccount
}

const mailAccountFoldersMap = {}

export const getFoldersForMailAccount  = async (db, mailAccountId) =>  {
    if(!mailAccountFoldersMap[mailAccountId]){
        const collectionResult = await db.collection('MailAccountFolder').find({mailAccount:mailAccountId}).toArray()

        mailAccountFoldersMap[mailAccountId] = new Map()
        if(collectionResult.length === 0){
            // create inbox
            const anonymousUser = await ApiUtil.userByName(db, 'anonymous')

            const inbox = {createdBy:anonymousUser._id,
                subscribed:true,
                path:'INBOX',
                uidValidity:1,
                uidNext: 1,
                modifyIndex: 1,
                symbol:'INBOX',
                mailAccount: mailAccountId}

            const insertedData = await db.collection('MailAccountFolder').insertOne(inbox)
            inbox._id = insertedData.insertedId
            collectionResult.push(inbox)
        }

        collectionResult.forEach(entry=>{
            if(entry.symbol) {
                entry.symbol = Symbol(entry.symbol)
            }

            mailAccountFoldersMap[mailAccountId].set(entry.path,entry)
        })

    }

    return mailAccountFoldersMap[mailAccountId]
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



export const getMessageIdsForFolderId = async (db, mailAccountFolderId) => {
    return await db.collection('MailAccountMessage').distinct('_id',{mailAccountFolder: getMessageIdsForFolderId})
}

export const getMessagesForFolder = async (db, mailAccountFolderId) => {
    return await db.collection('MailAccountMessage').find({mailAccountFolder: mailAccountFolderId}).toArray()
}
