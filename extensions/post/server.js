import Hook from 'util/hook'
import schema from './schema/'
import resolver from './resolver/'
import {deepMergeToFirst} from 'util/deepMerge'

// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolver(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schema)
})


// Hook to create mongodb index
Hook.on('index', ({db}) => {

    console.log('Creating indexes for post...')


    // create indexes
    const postCollection = db.collection('Post')

    // full text search
    //postCollection.dropIndex('postFTS')
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
    postCollection.createIndex( { 'title': 1 }, { unique: false } )


})
