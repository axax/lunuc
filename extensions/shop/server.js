import Hook from 'util/hook'
import schemaGen from './gensrc/schema'
import schema from './schema'
import resolverGen from './gensrc/resolver'
import resolver from './resolver'
import {deepMergeToFirst} from 'util/deepMerge'
import config from 'gen/config'

const {LANGUAGES} = config

// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolver(db), resolverGen(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schema)
    schemas.push(schemaGen)
})


// Hook to create mongodb index
Hook.on('index', ({db}) => {

    console.log('Creating indexes for shop...')

    const categoryCollection = db.collection('ProductCategory')

    for (const lang of LANGUAGES) {
        categoryCollection.createIndex( { ['name_localized.'+lang]: 1 }, { unique: false } )
    }


    // field slug hast to be unique
    /* const cmsPageCollection = db.collection('CmsPage')
     cmsPageCollection.createIndex({slug: 1}, {unique: true})*/


})