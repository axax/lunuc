import Hook from '../../util/hook.cjs'
import {getTypes} from '../../util/types.mjs'
import config from '../../gensrc/config.mjs'
import crypto from 'crypto'

const {LANGUAGES} = config
/*
Here all mongodb indexes are created
 */
/*
 Wraps db so that every collection(...).createIndex(...) - also the ones in
 Hook.on('index') handlers - is tracked and never ends as an unhandled
 rejection (e.g. a unique index failing because of duplicates).
 All other methods are passed through unchanged.
 */
const trackIndexCreation = (db) => {
    const results = []
    const wrapCollection = (collection, name) => new Proxy(collection, {
        get(target, prop) {
            if (prop === 'createIndex') {
                return (...args) => {
                    const p = target.createIndex(...args)
                    const tracked = p.catch(e => {
                        console.error(`Error creating index for ${name} ${JSON.stringify(args[0])}`, e.message)
                        throw e
                    })
                    // own handler so the tracked promise never is unhandled
                    results.push(tracked.then(() => true, () => false))
                    return tracked
                }
            }
            const value = Reflect.get(target, prop, target)
            return typeof value === 'function' ? value.bind(target) : value
        }
    })
    const proxy = new Proxy(db, {
        get(target, prop) {
            if (prop === 'collection') {
                return (name, ...rest) => wrapCollection(target.collection(name, ...rest), name)
            }
            const value = Reflect.get(target, prop, target)
            return typeof value === 'function' ? value.bind(target) : value
        }
    })
    return {db: proxy, results}
}

/*
 Hash over everything that defines the indexes: index related type
 properties, the languages, the source of the index hooks and of
 createAllIndexes itself. Changes whenever an index definition changes.
 */
export const getIndexFingerprint = () => {
    const types = getTypes()
    const spec = Object.keys(types).sort().map(typeName => {
        const type = types[typeName]
        return [
            typeName,
            (type.fields || []).filter(f => f.index || f.compoundIndex)
                .map(f => [f.name, f.index, f.compoundIndex, f.localized, f.unique, f.type]),
            type.noUserRelation, type.createdByIndex, type.wildcardIndex, type.wildcardTextIndex, type.indexes
        ]
    })
    const hooks = (Hook.hooks.index || []).map(h => h.callback.toString())
    return crypto.createHash('md5')
        .update(JSON.stringify([spec, LANGUAGES, hooks, createAllIndexesImpl.toString()]))
        .digest('hex')
}

/*
 Creates all indexes and resolves once all createIndex calls have finished.
 ok is false if at least one index could not be created.
 */
export const createAllIndexesAndWait = async (rawDb) => {
    const {db, results} = trackIndexCreation(rawDb)
    const status = await createAllIndexesImpl(db)
    const all = await Promise.all(results)
    const failed = all.filter(r => !r).length
    return {...status, ok: failed === 0, total: all.length, failed}
}

export const createAllIndexes = async (rawDb) => {
    // createIndex calls are tracked, so failures are logged instead of
    // ending as unhandled rejections (fire and forget as before)
    return createAllIndexesImpl(trackIndexCreation(rawDb).db)
}

const createAllIndexesImpl = async (db) => {

    return

    console.log(`Creating indexes... ${new Date() - _app_.start}ms`)
    db.collection('KeyValue').createIndex({createdBy: 1, key: 1}, {unique: true})
    db.collection('KeyValueGlobal').createIndex({key: 1}, {unique: true})


    db.collection('User').createIndex({email: 1, domain: 1}, {unique: true})
    db.collection('User').createIndex({username: 1}, {unique: true})
    // token lookups of the public newPassword / confirmEmail mutations;
    // partial: only documents that carry a token are indexed
    db.collection('User').createIndex({resetToken: 1}, {partialFilterExpression: {resetToken: {$type: 'string'}}})
    db.collection('User').createIndex({signupToken: 1}, {partialFilterExpression: {signupToken: {$type: 'string'}}})

    //db.collection('StaticFile').dropIndex( 'name_1')
    //db.collection('MailAccount').dropIndex( 'username_1')


    //await db.collection('NewsletterSubscriber').dropIndex( 'email_1_location_1')
   // await db.collection('Media').dropIndex( 'group_1_mimeType_1')
  /*  console.log(await db.collection('Media').indexes())

    await db.collection('GenericData').dropIndex( 'definition_1__id_1')
    console.log(await db.collection('GenericData').indexes())*/
    //await db.collection('GenericData').dropIndex( 'data.id_1')

    const types = getTypes()

    for (const typeName of Object.keys(types)) {
        const type = types[typeName]
        const textIndex = {}
        for (const field of type.fields) {

            // A compound index names its own fields, so it does not depend on
            // this field being indexed itself. It used to sit inside the
            // field.index check below, which silently dropped every
            // compoundIndex declared on a field without an `index` property.
            if (field.compoundIndex) {
                field.compoundIndex.forEach(idx => {
                    console.log(`Creating compound index for ${JSON.stringify(idx)}`)
                    db.collection(typeName).createIndex(idx.fields, {
                        background: true,
                        unique: idx.unique
                    }).catch(async e => {
                        console.error(`Error creating compound index for ${typeName}`, e)
                    })
                })
            }

            if (field.index) {
                console.log(`Creating index for ${typeName}.${field.name}`)
                if (field.localized) {
                    for (const lang of LANGUAGES) {
                        if( field.index === 'text') {
                            textIndex[field.name + '.' + lang] = 'text'
                        }else{
                            db.collection(typeName).createIndex({[field.name + '.' + lang]: field.index}, {background: true, unique: !!field.unique}).catch(async e=>{
                                console.error(`Error creating index for ${typeName}.${field.name}.${lang}`, e)
                            })
                        }

                    }
                } else {
                    if( field.index === 'text') {
                        textIndex[field.name] = 'text'
                    }else{
                        if( field.index.constructor === Object){
                            Object.keys(field.index).forEach(k=>{
                                const idx = field.index[k]
                                console.log(`Creating subindex for ${typeName}.${field.name}.${k}`)
                                db.collection(typeName).createIndex({[field.name+'.'+k]: idx}, {
                                    background: true
                                }).catch(async e=>{
                                    console.error(`Error creating index for ${typeName}.${field.name}.${k}`, e)
                                })
                            })
                        }else{
                            db.collection(typeName).createIndex({[field.name+(field.type==='Object'?'.$**':'')]: field.index}, {
                                background: true,
                                unique: !!field.unique
                            }).catch(async e=>{
                                console.error(`Error creating index for ${typeName}.${field.name}`, e)
                            })
                        }

                    }
                }
            }
        }



        // createdByIndex: false skips the automatic createdBy index for types
        // that keep the user relation but never query by it (e.g. UserTracking,
        // where every index costs cache on each insert).
        if(!type.noUserRelation && type.createdByIndex !== false) {
            // create index for createdBy
            console.log(`Creating index for ${typeName}.createdBy`)

            db.collection(typeName).createIndex({createdBy:1}, {
                background: true,
                unique: false
            }).catch(async e=>{
                console.error(`Error creating index for ${typeName}.createdBy`, e)
            })
        }



        if( Object.keys(textIndex).length > 0){
            db.collection(typeName).createIndex(textIndex).catch(async e=>{
                console.error('Error creating text index', e)
            })
        }

        if(type.wildcardIndex){
            console.log(`Creating wildcard index for ${typeName}`)
            db.collection(typeName).createIndex({ '$**': 1 })
        }
        if(type.wildcardTextIndex){
            console.log(`Creating wildcard text index for ${typeName}`)
            db.collection(typeName).createIndex({ '$**': 'text' })
        }

        if(type.indexes){
            for(const index of type.indexes){
                console.log(`Creating index for ${typeName}`, index.fields, index.options)
                db.collection(typeName).createIndex(index.fields, index.options).catch(async e=>{
                    console.error(`Error creating index for ${typeName}.${index.name}`, e)
                })
            }
        }
    }

    Hook.call('index', {db})
    console.log(`Indexes created ${new Date() - _app_.start}ms`)
    console.log(`---------------------------------------------`)

    return {status:'Indexes created'}
}

