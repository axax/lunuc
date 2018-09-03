import {MongoClient} from 'mongodb'
import {createAllInitialData} from './data/initialDbData'
import {createAllIndexes} from './index/indexes'
import ClientUtil from 'client/util'

const MONGO_URL = (process.env.MONGO_URL || process.env.LUNUC_MONGO_URL)

//const MONGO_URL="mongodb://localhost:27018/lunuc"

// LUNUC_MONGO_URL="mongodb+srv://lunuc:<PASSWORD>@cluster0-zi771.gcp.mongodb.net/lunuc?ssl=true" npm run api
/*

 Backup: mongodump --uri $LUNUC_MONGO_URL -v --archive=backup.25022018.gz --gzip
 Restore: mongorestore --gzip --archive=backup.1522675219299.gz --port 27018

 mongorestore --gzip --archive=/Users/simonscharer/dev/react/lunuc/backups/dbdumps/backup.db.1535921775342.gz --db lunuc --host Cluster0-shard-0/cluster0-shard-00-00-zi771.gcp.mongodb.net:27017,cluster0-shard-00-01-zi771.gcp.mongodb.net:27017,cluster0-shard-00-02-zi771.gcp.mongodb.net:27017 --ssl --username lunuc --authenticationDatabase admin

 */

export const dbPreparation = async (db, cb) => {

    if (db) {

        await createAllInitialData(db)

        await createAllIndexes(db)

    }

    cb(db)
}


export const dbConnection = (cb) => {
    if (!MONGO_URL || MONGO_URL === '') {
        console.error('Mongo URL missing. Please set env variable (export MONGO_URL=mongodb://user:password@mongodb/)')

        cb(new Error('Mongo URL missing. Please set env variable (export MONGO_URL=mongodb://user:password@mongodb/)'), null)
    } else {
        const urlParts = MONGO_URL.split('?')
        const urlParams = urlParts.length > 1 ? ClientUtil.extractQueryParams(urlParts[1]) : {}
        MongoClient.connect(urlParts[0],
            {
                /* http://mongodb.github.io/node-mongodb-native/2.1/reference/connecting/connection-settings/ */
                reconnectTries: 0,
                autoReconnect: true,
                poolSize: 10,
                ssl: urlParams.ssl === 'true' ? true : false,
                useNewUrlParser: true
            },
            function (err, client) {
                if (err) {
                    console.error(err.message, MONGO_URL)
                } else {
                    console.log(`Connection to db ${MONGO_URL} established.`)
                    const parts = urlParts[0].split('/')
                    const db = client.db(parts[parts.length - 1])

                    cb(err, db, client)
                }

            }
        )
    }
}
