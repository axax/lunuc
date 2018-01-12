export const createAllIndexes = async (db) =>{

    console.log('Creating indexes...')

    // create indexes
    const postCollection = db.collection('Post')

    // full text search
    await postCollection.createIndex({'search.*': 'text', 'title': 'text'}, {
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

    // field slug hast to be unique
    const cmsPageCollection = db.collection('CmsPage')
    cmsPageCollection.createIndex( { 'slug': 1 }, { unique: true } )


    db.collection('KeyValue').createIndex( { createdBy:1,key: 1 }, { unique: true } )


}

