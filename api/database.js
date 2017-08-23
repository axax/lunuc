import {MongoClient} from 'mongodb'

const MONGO_URL = (process.env.MONGO_URL || process.env.LUNUC_MONGO_URL)


export const dbPreparation = async (db, cb) => {

    if( db ) {
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

    cb(db)
}


export const dbConnection = (cb) => {
    if (!MONGO_URL || MONGO_URL === '') {
        console.error('Mongo URL missing. Please set env variable (export MONGO_URL=mongodb://user:password@mongodb/)')

        cb(new Error('Mongo URL missing. Please set env variable (export MONGO_URL=mongodb://user:password@mongodb/)'),null)
    }else {
        MongoClient.connect(MONGO_URL,
            {
                /* http://mongodb.github.io/node-mongodb-native/2.1/reference/connecting/connection-settings/ */
                reconnectTries: 0,
                autoReconnect: true,
                poolSize: 10,
                ssl: false
            },
            function (err, db) {
                if (err) {
                    console.error(err.message)
                } else {
                    console.log(`Connection to db ${MONGO_URL} established.`)
                }
                cb(err,db)
            }
        )
    }
}
