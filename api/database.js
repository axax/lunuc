import {MongoClient, ObjectId} from 'mongodb'

const MONGO_URL = process.env.LUNUC_MONGO_URL

export const dbPreparation = async (db,cb) => {


	const userRoleCollection = db.collection('UserRole')


	const nrOfUserRoles = (await userRoleCollection.count())

	if( nrOfUserRoles === 0 ){
		// insert some user roles

		await userRoleCollection.insertMany([
			{name: 'administrator', capabilities: ['manage_keyvalues']},
			{name: 'subscriber', capabilities: []}
		])
	}

	console.log('Database prepared.')

	cb(db)
}


export const dbConnection = (cb) => {
	if( !MONGO_URL || MONGO_URL===''){
		console.error('Mongo URL missing. Please set env variable (export LUNUC_MONGO_URL=mongodb://user:password@mongodb/)')
		return
	}
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
