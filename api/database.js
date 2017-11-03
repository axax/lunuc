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

        // create indexes
        const postCollection = db.collection('Post')

        postCollection.createIndex({'search.*': 'text', 'title': 'text'}, {
            name: 'postFTS',
            weights: {
                'title': 100,
                'search.headerOne': 50,
                'search.headerTwo': 40,
                'search.headerThree': 30,
                'search.headerFour': 25,
                'search.headerFive': 20,
                'search.headerSix': 15,
                'search.styleBold': 10,
                'search.styleItalic': 3,
                'search.blockquote': 3,
                'search.styleUnderline': 2,
                'search.unorderedListItem': 2,
                'search.orderedListItem': 2,
                'search.unstyled': 2,
                'search.styleCode': 2,
                'search.codeBlock': 1
            }
        })

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
