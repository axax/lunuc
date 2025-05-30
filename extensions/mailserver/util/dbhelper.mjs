import ApiUtil from '../../../api/util/index.mjs'
import MailserverResolver from "../gensrc/resolver.mjs";


export const getMailAccountByEmail = async (db, address)=> {
    const addressParts = address.split('@'),
        username = addressParts[0],
        host = addressParts[1]
    const mailAccount = await db.collection('MailAccount').findOne({username, host})
    return mailAccount
}


export const createFolderForMailAccount = async (db, mailAccountId, data) => {

}


export const getFoldersForMailAccount  = async (db, mailAccountId) =>  {
    const collectionResult = await db.collection('MailAccountFolder').find({mailAccount:mailAccountId}).toArray()

    const mailAccountFoldersMap = new Map()
    if(collectionResult.length === 0){
        // create inbox
        const anonymousUser = await ApiUtil.userByName(db, 'anonymous')

        const defaultMailboxes = [
            {path:'INBOX',symbol:'INBOX'},
            {path:'Sent Messages',symbol:'Sent Messages',special_use:'\\Sent'},
            {path:'Drafts',symbol:'Drafts',special_use:'\\Drafts'},
            {path:'Junk',symbol:'Junk',special_use:'\\Junk'},
            {path:'Trash',symbol:'Deleted Messages',special_use:'\\Trash'},
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

    for(const folder of collectionResult){
        if(folder.symbol) {
            folder.symbol = Symbol(folder.symbol)
        }
        mailAccountFoldersMap.set(folder.path,folder)
    }
    return mailAccountFoldersMap
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

export const getMessagesForFolder = async (db, mailAccountFolderId, match = {}, project) => {
    const aggr = [
        {
            $match: {
                mailAccountFolder: mailAccountFolderId,
                ...match
            }
        }
    ]
    if(project){
        aggr.push({ $project: project})
    }
    return await db.collection('MailAccountMessage').aggregate( aggr ).toArray()
}

export const deleteMessagesForFolderByUids = async (db, folder, uids) => {
    if(folder.uidList) {
        for (const uid of uids) {
            const index = folder.uidList.indexOf(uid)
            if (index !== -1) {
                folder.uidList.splice(index, 1)
            }
        }
    }
    return await db.collection('MailAccountMessage').deleteMany( {
        uid: { $in: uids },
        mailAccountFolder: folder._id
    } )
}


function addEmailAddresses(mailValues, allEmailAdrs) {
    if (mailValues?.value?.length > 0) {
        for (const mailValue of mailValues.value) {
            if (mailValue?.address && allEmailAdrs.indexOf(mailValue.address) < 0) {
                allEmailAdrs.push(mailValue.address)
            }
        }
    }
}

export const getMailAccountsFromMailData = async (db, data) => {
    const mailAccounts = []
    const allEmailAdrs = []
    addEmailAddresses(data?.to, allEmailAdrs)
    addEmailAddresses(data?.cc, allEmailAdrs)
    addEmailAddresses(data?.bcc, allEmailAdrs)

    for (const mailAdr of allEmailAdrs) {
        const mailAccount = await getMailAccountByEmail(db, mailAdr)
        if(mailAccount){
            mailAccounts.push(mailAccount)
        }
    }
    return mailAccounts
}