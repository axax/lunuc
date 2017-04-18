import {MongoClient, ObjectId} from 'mongodb'

const MONGO_URL = 'mongodb://lunuc:sommer2017@ds145780.mlab.com:45780/lunuc'

export const dbConnection = (cb) => {
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
				console.error(err)
			} else {
				console.log('Connection to db established.')
				cb(db)
			}
		}
	)
}
