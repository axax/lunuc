import Hook from '../../util/hook'

export const createAllIndexes = async (db) =>{

    console.log('Creating indexes...')

    // field slug hast to be unique
    const cmsPageCollection = db.collection('CmsPage')
    cmsPageCollection.createIndex( { 'slug': 1 }, { unique: true } )


    db.collection('KeyValue').createIndex( { createdBy:1,key: 1 }, { unique: true } )


    Hook.call('index', {db})

}

