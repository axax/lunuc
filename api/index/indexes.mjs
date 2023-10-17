import Hook from '../../util/hook.cjs'
import {getTypes} from '../../util/types.mjs'
import config from '../../gensrc/config.mjs'

const {LANGUAGES} = config
/*
Here all mongodb indexes are created
 */
export const createAllIndexes = async (db) => {

    return

    console.log(`Creating indexes... ${new Date() - _app_.start}ms`)
    db.collection('KeyValue').createIndex({createdBy: 1, key: 1}, {unique: true})
    db.collection('KeyValueGlobal').createIndex({key: 1}, {unique: true})


    db.collection('User').createIndex({email: 1, domain: 1}, {unique: true})
    db.collection('User').createIndex({username: 1}, {unique: true})

    //db.collection('User').dropIndex( 'email_1')


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
                        if( field.compoundIndex){
                            field.compoundIndex.forEach(idx=>{
                                console.log(`Creating compound index for ${JSON.stringify(idx)}`)
                                db.collection(typeName).createIndex(idx.fields, {
                                    background: true,
                                    unique: idx.unique
                                }).catch(async e=>{
                                    console.error(`Error creating compound index for ${typeName}`, e)
                                })
                            })
                        }

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



        if(!type.noUserRelation) {
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
    }

    Hook.call('index', {db})
    console.log(`Creating indexes... ${new Date() - _app_.start}ms`)

}

