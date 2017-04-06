import {MongoClient, ObjectId} from 'mongodb'

const MONGO_URL = 'mongodb://lunuc:sommer2017@ds145780.mlab.com:45780/lunuc'

export const dbConnection = (cb) => {
	MongoClient.connect(MONGO_URL, function (err, db) {
		if (err){
			console.error(err)
		}else{
			console.log('Connection to db established.')
			cb(db)
		}
	})
}
