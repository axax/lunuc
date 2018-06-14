import Util from '../util'


export const createAllInitialData = async (db) => {
    console.log('Inserting data...')
    await createUserRoles(db)
    await createUsers(db)
}


export const createUserRoles = async (db) => {
    const userRoleCollection = db.collection('UserRole')
    userRoleCollection.updateOne(
        {name: 'administrator'},
        {$addToSet: {capabilities: {$each: ['view_app', 'access_admin_page', 'manage_types', 'manage_keyvalues', 'manage_cms_pages', 'manage_other_users']}}},
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


    userRoleCollection.updateOne(
        {name: 'demo'},
        {$addToSet: {capabilities: {$each: ['view_app', 'read_everythin']}}},
        {
            upsert: true
        }
    )

}

export const createUsers = async (db) => {

    const userCollection = db.collection('User')

    if (userCollection.count()) {
        const userRole = (await db.collection('UserRole').findOne({name: 'administrator'}))

        const insertResult = await userCollection.updateOne({
            username: 'admin'
        }, {
            $set: {
                role: userRole._id,
                emailConfirmed: false,
                email: 'axax@gmx.net',
                username: 'admin',
                password: Util.hashPassword('password')
            }
        }, {upsert: true})
    }
}