import genSchema from './gensrc/schema.mjs'
import genResolver from './gensrc/resolver.mjs'
import schema from './schema'
import resolver from './resolver'
import Hook from '../../util/hook.cjs'
import {deepMergeToFirst} from '../../util/deepMerge.mjs'
import React from 'react'
import {trackMail} from './track.mjs'


// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, genResolver(db), resolver(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(genSchema)
    schemas.push(schema)
})


Hook.on('mailSent', (data) => {
    trackMail(data)
})
