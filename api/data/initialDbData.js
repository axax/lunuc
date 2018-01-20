export const createAllInitialData = async (db) => {
    console.log('Inserting data...')
    await createUserRoles(db)
}


export const createUserRoles = async (db) => {
    const userRoleCollection = db.collection('UserRole')


    userRoleCollection.updateOne(
        {name: 'administrator'},
        {$addToSet: {capabilities: {$each: ['manage_keyvalues', 'mangage_cms_pages']}}},
        {
            upsert: true
        }
    )

    userRoleCollection.updateOne(
        {name: 'subscriber'},
        {$addToSet: {capabilities: []}},
        {
            upsert: true
        }
    )

}