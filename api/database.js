import {MongoClient} from 'mongodb'
import {createAllInitialData} from './data/initialData'
import {createAllIndexes} from './index/indexes'
import ClientUtil from 'client/util'
import Hook from '../util/hook'
import Util from './util'
import {registerTrs} from '../util/i18nServer'


/*

 Backup: mongodump --uri $LUNUC_MONGO_URL -v --archive=backup.25022018.gz --gzip
 Restore: mongorestore --gzip --archive=backup.1522675219299.gz --port 27018

 mongorestore --gzip --archive=/Users/simonscharer/dev/react/lunuc/backups/dbdumps/backup.db.1535921775342.gz --db lunuc --host Cluster0-shard-0/cluster0-shard-00-00-zi771.gcp.mongodb.net:27017,cluster0-shard-00-01-zi771.gcp.mongodb.net:27017,cluster0-shard-00-02-zi771.gcp.mongodb.net:27017 --ssl --username lunuc --authenticationDatabase admin

 */

export const dbPreparation = async (db, cb) => {

    if (db) {

        await createAllInitialData(db)

        await createAllIndexes(db)

        console.log('load global translations from key/value store')
        const globalTranslations = (await Util.getKeyValueGlobal(db, null, "GlobalTranslations", true)) || {}

        registerTrs(globalTranslations)

    }

    cb(db)
}


export const dbConnection = (dburl, cb) => {
    if (!dburl) {
        console.error('Mongo URL missing. Please set env variable (export MONGO_URL=mongodb://user:password@mongodb/)')

        cb(new Error('Mongo URL missing. Please set env variable (export MONGO_URL=mongodb://user:password@mongodb/)'), null)
    } else {
        const urlParts = dburl.split('?')
        const urlParams = urlParts.length > 1 ? ClientUtil.extractQueryParams(urlParts[1], true) : {}
        const options = {
            /* http://mongodb.github.io/node-mongodb-native/2.1/reference/connecting/connection-settings/ */
            /*reconnectTries: 99,
            autoReconnect: true,
            ssl: false,
            useNewUrlParser: true,
            poolSize: 20,
            socketTimeoutMS: 480000,
            keepAlive: 300000,
            sslValidate: false,*/
            useUnifiedTopology: true,
            ...urlParams
        }
        MongoClient.connect(urlParts[0],
            options,
            function (err, client) {
                if (err) {
                    console.error(err.message, dburl)
                } else {
                    console.log(`Connection to db ${dburl} established. 🚀`)
                    const parts = urlParts[0].split('/')
                    const db = client.db(parts[parts.length - 1])

                    Hook.call('dbready', {db})

                    cb(err, db, client)
                }

            }
        )
    }
}
