import {MongoClient, ObjectId} from 'mongodb'


const MONGO_URL = 'mongodb://lunuc:sommer2017@ds145780.mlab.com:45780/lunuc'
var database = null

MongoClient.connect(MONGO_URL, function(err, db) {
	if (err) return console.error(err)
	database = db
	console.log('Connected correctly to server.')
})


export const collection = (name) => (database.collection(name))