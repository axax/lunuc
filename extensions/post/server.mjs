import Hook from '../../util/hook.cjs'
import schema from './schema/index.mjs'
import resolver, {searchFieldsForBody} from './resolver/index.mjs'
import {deepMergeToFirst} from '../../util/deepMerge.mjs'

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
    }).catch(e => console.warn('post: could not create text index', e.message))
    postCollection.createIndex( { 'title': 1 }, { unique: false } )

    // Suchfelder für Lexical-Posts nachträglich befüllen (wurden früher nicht gesetzt)
    backfillSearchFields(postCollection).catch(e => console.warn('post: search backfill failed', e.message))


})


const backfillSearchFields = async (postCollection) => {
    const cursor = postCollection.find({editor: 'lexical', body: {$exists: true, $ne: ''}}, {projection: {body: 1, editor: 1}})
    let count = 0
    for await (const post of cursor) {
        const search = searchFieldsForBody(post.body, post.editor)
        await postCollection.updateOne({_id: post._id}, {$set: {search}})
        count++
    }
    if (count) {
        console.log(`post: search fields updated for ${count} posts`)
    }
}
