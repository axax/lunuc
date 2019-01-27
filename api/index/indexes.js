import Hook from '../../util/hook'

export const createAllIndexes = async (db) =>{

    console.log('Creating indexes...')

    db.collection('KeyValue').createIndex( { createdBy:1,key: 1 }, { unique: true } )

    Hook.call('index', {db})

}

