export const createAllInitialData = async (db) =>{
    console.log('Inserting data...')
    await createUserRoles(db)
}


export const createUserRoles = async (db) =>{
    const userRoleCollection = db.collection('UserRole')


    const nrOfUserRoles = (await userRoleCollection.count())

    if (nrOfUserRoles === 0) {
        // insert some user roles

        await userRoleCollection.insertMany([
            {name: 'administrator', capabilities: ['manage_keyvalues']},
            {name: 'subscriber', capabilities: []}
        ])
    }
}