export const createAllInitialData = async (db) => {
    console.log('Inserting data...')
    await createUserRoles(db)
}


export const createUserRoles = async (db) => {
    const userRoleCollection = db.collection('UserRole')


    userRoleCollection.updateOne(
        {name: 'administrator'},
        {$addToSet: {capabilities: {$each: ['view_app', 'access_admin_page', 'manage_keyvalues', 'mangage_cms_pages']}}},
        {
            upsert: true
        }
    )

    userRoleCollection.updateOne(
        {name: 'subscriber'},
        {$addToSet: {capabilities: {$each: ['view_app']}}},
        {
            upsert: true
        }
    )

}